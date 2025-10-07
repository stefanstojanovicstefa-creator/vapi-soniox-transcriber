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

      const config = {
        api_key: SONIOX_API_KEY,
        model: "stt-rt-preview-v2",
        audio_format: "pcm_s16le",
        sample_rate: 16000,
        num_channels: 2,          // stereo
        language: "sr",           // forsiraj srpski
        enable_language_identification: false,
        enable_speaker_diarization: false,
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

      if (message.error_code) {
        console.error("❌ Soniox error:", message.error_message);
        this.emit("transcriptionerror", message.error_message);
        return;
      }

      if (message.finished) return;

      // Ako postoji text
      if (typeof message.text === "string" && message.text.trim().length > 0) {
        const channelIndex = message.channel_index ? message.channel_index[0] : 0;
        const channel = channelIndex === 0 ? "customer" : "assistant";

        // Ignoriši assistant kanal da ne praviš loop
        if (channel !== "customer") return;

        if (message.is_final) {
          this._emitFinalText(message.text.trim());
        }
        return;
      }

      // Ako postoje tokens
      if (Array.isArray(message.tokens) && message.tokens.length > 0) {
        let finalTextChunk = "";
        let channelIndexForChunk = message.channel_index ? message.channel_index[0] : 0;

        for (const token of message.tokens) {
          if (token.text === "<end>") continue;
          if (!token.is_final) continue;
          if (token.language && token.language !== "sr") continue;

          if (token.channel_index && Array.isArray(token.channel_index)) {
            channelIndexForChunk = token.channel_index[0];
          }

          finalTextChunk += token.text;
        }

        const channel = channelIndexForChunk === 0 ? "customer" : "assistant";
        if (channel !== "customer") return;

        if (finalTextChunk.trim()) {
          this.sentenceBuffer += finalTextChunk;

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