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
        num_channels: 2, // probaj i sa 1 ako ne radi
        language_hints: ["sr", "hr", "bs"],
        enable_speaker_diarization: false,
        enable_endpoint_detection: true,
        enable_non_final_tokens: false,
        enable_language_identification: true,
      };

      console.log("📤 Sending config to Soniox:", config);
      this.ws.send(JSON.stringify(config));
    });

    this.ws.on("message", (data) => {
      try {
        const message = JSON.parse(data);
        console.log("⬅️ Raw Soniox message:", JSON.stringify(message));

        if (message.error_code) {
          console.error("❌ Soniox error:", message.error_message);
          return;
        }

        if (message.finished) return;
        if (!message.text) return;

        const channelIndex = message.channel_index
          ? message.channel_index[0]
          : 0;
        const channel = channelIndex === 0 ? "customer" : "assistant";

        if (message.is_final && message.text.trim()) {
          this.emit("transcription", message.text.trim(), channel);
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

    console.log("➡️ Sending audio chunk to Soniox:", payload.length);
    this.ws.send(payload);
  }
}

module.exports = TranscriptionService;