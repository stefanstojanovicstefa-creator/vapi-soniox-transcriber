// transcriptionService.js

const WebSocket = require("ws");
const EventEmitter = require("events");

const SONIOX_API_KEY = process.env.SONIOX_API_KEY;

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.finalBuffer = { customer: "", assistant: "" };
    this.speakersMap = { "1": "customer", "2": "assistant" };
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
        num_channels: 2, // Vapi šalje stereo, Soniox koristi diarizaciju
        language_hints: ["sr", "hr", "bs"],
        enable_speaker_diarization: true,
        enable_endpoint_detection: true,
        enable_non_final_tokens: true,
        enable_language_identification: true,
        max_non_final_tokens_duration_ms: 1000
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

          // Soniox vraća channel_index kao npr. [0, ...] ili [1, ...]
          // U tvojoj implementaciji koristiš speakerId kao "1" ili "2"
          const speakerId = token.speaker || "1";
          const channel = this.speakersMap[speakerId] || "customer";

          if (token.is_final) {
            this.finalBuffer[channel] += token.text;
          }
        }

        // Šalji samo customer tokene nazad Vapiju
        // Assistant tokene NE šalji (već su poslati iz model-output poruke)
        if (this.finalBuffer.customer.trim()) {
          this.emit("transcription", this.finalBuffer.customer.trim(), "customer");
          this.finalBuffer.customer = "";
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
    
    // Šalji audio direktno Sonioxu (Vapi šalje stereo, Soniox koristi diarizaciju)
    this.ws.send(payload);
  }
}

module.exports = TranscriptionService;