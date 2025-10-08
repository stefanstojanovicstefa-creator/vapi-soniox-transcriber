// transcriptionService.js

const WebSocket = require("ws");
const EventEmitter = require("events");

const SONIOX_API_KEY = process.env.SONIOX_API_KEY;

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
  }

  connect() {
    const url = "wss://stt-rt.soniox.com/transcribe-websocket";
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("✅ Connected to Soniox WebSocket");
      
      const config = {
        api_key: SONIOX_API_KEY,
        model: "stt-rt-preview-v2",
        audio_format: "pcm_s16le",
        sample_rate: 16000,
        num_channels: 2, // ✅ Vapi šalje stereo
        language_hints: ["sr", "hr", "bs"],
        enable_speaker_diarization: false, // ✅ NE koristi, koristi channel_index
        enable_endpoint_detection: true,
        enable_non_final_tokens: false, // ✅ Samo finalne tokene
        enable_language_identification: true
      };
      
      this.ws.send(JSON.stringify(config));
    });

    this.ws.on("message", (data) => {
      try {
        const message = JSON.parse(data);
        if (message.error_code) {
          console.error("❌ Soniox error:", message.error_message);
          return;
        }
        if (message.finished) return;
        if (!message.tokens) return;

        for (const token of message.tokens) {
          if (token.text === "<end>") continue;
          if (token.translation_status && token.translation_status !== "none") continue;
          if (token.language && !["sr", "hr", "bs"].includes(token.language)) continue;

          // ✅ KORISTI channel_index IZ SONIOXA
          const channelIndex = token.channel_index ? token.channel_index[0] : 0;
          const channel = channelIndex === 0 ? "customer" : "assistant";

          if (token.is_final && channel === "customer") {
            this.emit("transcription", token.text.trim(), channel);
          }
        }
      } catch (err) {
        console.error("Error parsing Soniox response:", err.message);
      }
    });

    this.ws.on("error", (err) => {
      console.error("❌ Soniox WebSocket error:", err.message);
    });

    this.ws.on("close", () => {
      console.log("🔚 Soniox WebSocket closed");
    });
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("⚠️ Soniox WebSocket not ready");
      return;
    }
    if (!(payload instanceof Buffer)) return;
    
    // ✅ Šalji stereo audio direktno Sonioxu
    this.ws.send(payload);
  }
}

module.exports = TranscriptionService;