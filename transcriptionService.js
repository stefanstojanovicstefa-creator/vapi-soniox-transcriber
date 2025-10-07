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
        num_channels: 2, // ✅ Vapi šalje stereo
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

          const speakerId = token.speaker || "1";
          const channel = this.speakersMap[speakerId] || "customer";

          if (token.is_final) {
            this.finalBuffer[channel] += token.text;
          }
        }

        // Proveri da li ima novih finalnih tokena
        if (message.tokens.some(t => t.is_final && t.text !== "<end>")) {
          const speakerId = message.tokens.find(t => t.is_final && t.text !== "<end>")?.speaker || "1";
          const channel = this.speakersMap[speakerId] || "customer";
          
          if (this.finalBuffer[channel].trim()) {
            // NE šalji assistant tokene ako su AI govor (već smo ih poslali iz model-output)
            if (channel === "assistant") {
              this.finalBuffer[channel] = "";
              return;
            }
            
            this.emit("transcription", this.finalBuffer[channel].trim(), channel);
            this.finalBuffer[channel] = "";
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
    
    // Šalji audio direktno Sonioxu (Vapi šalje stereo, Soniox koristi diarizaciju)
    this.ws.send(payload);
  }
}

module.exports = TranscriptionService;