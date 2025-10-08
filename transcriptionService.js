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
        num_channels: 2,
        language_hints: ["sr", "hr", "bs"],
        enable_speaker_diarization: false,
        enable_endpoint_detection: true,
        // ✅ Uključujemo non-final tokene da bismo dobili kompletnu rečenicu na kraju
        enable_non_final_tokens: true,
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
        if (message.finished || !message.tokens) return;

        // Filtriraj tokene koji pripadaju korisniku (channel 0)
        const customerTokens = message.tokens.filter(token => 
            token.channel_index && 
            token.channel_index[0] === 0 &&
            token.text !== "<end>"
        );

        if (customerTokens.length === 0) return;

        // Proveri da li je u ovom bloku transkript finalizovan
        const isFinal = customerTokens.some(token => token.is_final);

        // ✅ Šaljemo transkript samo kada je finalizovan
        if (isFinal) {
            const finalTranscription = customerTokens.map(token => token.text).join("").trim();
            if (finalTranscription) {
                this.emit("transcription", finalTranscription);
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
    
    this.ws.send(payload);
  }
}

module.exports = TranscriptionService;