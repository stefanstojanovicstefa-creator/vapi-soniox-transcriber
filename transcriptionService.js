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
      console.log("✅ Povezan na Soniox WebSocket");

      const config = {
        api_key: SONIOX_API_KEY,
        model: "stt-rt-preview-v2",
        audio_format: "pcm_s16le",
        sample_rate: 16000,
        num_channels: 1,
        language_hints: ["sr", "hr", "bs"],
        enable_endpoint_detection: true,
        enable_non_final_tokens: false, // Šaljemo samo finalne rezultate
      };

      this.ws.send(JSON.stringify(config));
    });

    this.ws.on("message", (data) => {
      try {
        const message = JSON.parse(data);

        if (message.error_code) {
          console.error(`❌ Soniox greška: ${message.error_message}`);
          this.emit("transcriptionerror", message.error_message);
          return;
        }

        const words = message.final_words || [];
        if (words.length > 0) {
          const finalText = words.map(word => word.text).join("").trim();
          if (finalText) {
            this.emit("transcription", finalText);
          }
        }
      } catch (err) {
        console.error("Greška pri parsiranju Soniox odgovora:", err.message);
      }
    });

    this.ws.on("error", (err) => {
      console.error("❌ Soniox WebSocket greška:", err.message);
      this.emit("transcriptionerror", err.message);
    });

    this.ws.on("close", (code) => {
      console.log(`🔚 Soniox WebSocket konekcija zatvorena, kod: ${code}`);
    });
  }

  send(audioBuffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(audioBuffer);
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = TranscriptionService;