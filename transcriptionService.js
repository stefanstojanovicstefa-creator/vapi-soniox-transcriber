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
        num_channels: 2, // 🔑 sada koristimo stereo (0=customer, 1=assistant)
        language_hints: ["sr", "hr", "bs"],
        enable_endpoint_detection: true,
        enable_non_final_tokens: false
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
        if (!message.tokens) return;

        // Emituj svaki final transcript
        for (const token of message.tokens) {
          if (token.is_final && token.text && token.text !== "<end>") {
            const channel =
              token.channel_index === 0 ? "customer" : "assistant";

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

    try {
      // Nemoj više bacati desni kanal → šalji raw stereo buffer
      this.ws.send(payload);
    } catch (err) {
      console.error("Audio send error:", err.message);
    }
  }
}

module.exports = TranscriptionService;
