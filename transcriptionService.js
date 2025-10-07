const WebSocket = require("ws");
const EventEmitter = require("events");

const SONIOX_API_KEY = process.env.SONIOX_API_KEY;

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.sentenceBuffer = "";
  }

  connect() {
    const url = "wss://stt-rt.soniox.com/transcribe-websocket";
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("✅ Connected to Soniox WebSocket");

      // Forsiramo srpski, gasimo language ID; držimo mono dok ne potvrdiš stereo sa Vapi-ja
      const config = {
        api_key: SONIOX_API_KEY,
        model: "stt-rt-preview-v2",
        audio_format: "pcm_s16le",
        sample_rate: 16000,
        num_channels: 1,
        language: "sr",
        enable_speaker_diarization: false, // ne treba za mono
        enable_endpoint_detection: true,
        enable_non_final_tokens: false,
        enable_language_identification: false,
      };

      console.log("📤 Sending config to Soniox:", config);
      this.ws.send(JSON.stringify(config));
    });

    this.ws.on("message", (data) => {
      // Soniox real-time često vraća 'tokens' niz; retko 'text'
      let message;
      try {
        message = JSON.parse(data);
      } catch (err) {
        console.error("Error parsing Soniox response:", err.message);
        return;
      }

      console.log("⬅️ Raw Soniox message:", JSON.stringify(message));

      if (message.error_code) {
        console.error("❌ Soniox error:", message.error_message);
        this.emit("transcriptionerror", message.error_message);
        return;
      }

      if (message.finished) return;

      // Ako postoji message.text
      if (typeof message.text === "string" && message.text.trim().length > 0) {
        if (message.is_final) {
          this._emitFinalText(message.text.trim());
        }
        return;
      }

      // Ako postoje tokens (najčešći slučaj)
      if (Array.isArray(message.tokens) && message.tokens.length > 0) {
        let finalTextChunk = "";

        for (const token of message.tokens) {
          // Ignoriši marker kraja
          if (token.text === "<end>") continue;

          // Čuvaj samo finalne srpske tokene
          const isFinal = token.is_final === true;
          const isSerbian = token.language === "sr" || token.language === undefined; // neki modeli ne taguju svaki token

          if (!isFinal || !isSerbian) continue;

          if (typeof token.text === "string" && token.text.length > 0) {
            finalTextChunk += token.text;
          }
        }

        if (finalTextChunk.trim().length > 0) {
          this.sentenceBuffer += finalTextChunk;

          // Ako vidimo kraj rečenice, emitujemo celu rečenicu
          if (/[.!?]\s*$/.test(finalTextChunk.trim())) {
            this._emitFinalText(this.sentenceBuffer.trim());
            this.sentenceBuffer = "";
          }
        }
      }
    });

    this.ws.on("error", (err) => {
      console.error("❌ Soniox WebSocket error:", err.message);
      this.emit("transcriptionerror", err.message);
    });

    this.ws.on("close", () => {
      console.log("🔚 Soniox WebSocket closed");
    });
  }

  _emitFinalText(text) {
    // Emituje se uvek kao customer (jer šaljemo samo customer audio)
    this.emit("transcription", text);
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