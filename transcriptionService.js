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

      // Deklarišemo stereo i forsiramo srpski
      const config = {
        api_key: SONIOX_API_KEY,
        model: "stt-rt-preview-v2",
        audio_format: "pcm_s16le",
        sample_rate: 16000,
        num_channels: 2,          // stereo; Vapi chunkovi 1280 bajt = ~20ms stereo @16k
        language: "sr",           // eksplicitno srpski
        enable_language_identification: false,
        enable_speaker_diarization: false, // oslanjamo se na channel_index, ne diarizaciju
        enable_endpoint_detection: true,
        enable_non_final_tokens: false,
      };

      console.log("📤 Sending config to Soniox:", config);
      this.ws.send(JSON.stringify(config));
    });

    this.ws.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data);
      } catch (err) {
        console.error("Error parsing Soniox response:", err.message);
        return;
      }

      // Debug log
      if (message.tokens || message.text || message.channel_index) {
        console.log("⬅️ Raw Soniox message:", JSON.stringify(message));
      }

      if (message.error_code) {
        console.error("❌ Soniox error:", message.error_message);
        this.emit("transcriptionerror", message.error_message);
        return;
      }

      if (message.finished) return;

      // Prefer message.text if present
      if (typeof message.text === "string" && message.text.trim().length > 0) {
        const channelIndex = message.channel_index ? message.channel_index[0] : 0;
        const channel = channelIndex === 0 ? "customer" : "assistant";

        // Ignoriši assistant kanal da ne praviš petlju
        if (channel !== "customer") return;

        if (message.is_final) {
          this._emitFinalText(message.text.trim());
        }
        return;
      }

      // Fallback: tokens
      if (Array.isArray(message.tokens) && message.tokens.length > 0) {
        let finalTextChunk = "";
        let channelIndexForChunk = 0;

        // Ako Soniox pošalje channel_index na poruci
        if (message.channel_index && Array.isArray(message.channel_index)) {
          channelIndexForChunk = message.channel_index[0] ?? 0;
        }

        // Ako nema channel_index na poruci, pokušaj po tokenima
        for (const token of message.tokens) {
          if (token.text === "<end>") continue;

          // Koristi finalne tokene; srpski (neki modeli ne taguju svaki token jezikom)
          const isFinal = token.is_final === true;
          const isSerbian = token.language === "sr" || token.language === undefined;
          if (!isFinal || !isSerbian) continue;

          // Ako token ima channel_index, osveži ga (čuće se u petlji)
          if (token.channel_index && Array.isArray(token.channel_index)) {
            channelIndexForChunk = token.channel_index[0] ?? channelIndexForChunk;
          }

          if (typeof token.text === "string" && token.text.length > 0) {
            finalTextChunk += token.text;
          }
        }

        const channel = channelIndexForChunk === 0 ? "customer" : "assistant";
        // Ignoriši assistant kanal u Soniox-u; asistent ide kroz model-output u serveru
        if (channel !== "customer") return;

        if (finalTextChunk.trim()) {
          this.sentenceBuffer += finalTextChunk;

          // Emituj kad detektuješ kraj rečenice
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
    // Emitujemo uvek kao customer (Soniox dobija stereo ali mi šaljemo samo customer transkript)
    this.emit("transcription", text);
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("⚠️ Soniox WebSocket not ready");
      return;
    }
    if (!(payload instanceof Buffer)) return;

    // VAŽNO: ne konvertuj, ne downmixuj — šalji interleaved stereo as-is
    console.log("➡️ Sending audio chunk to Soniox:", payload.length);
    this.ws.send(payload);
  }
}

module.exports = TranscriptionService;