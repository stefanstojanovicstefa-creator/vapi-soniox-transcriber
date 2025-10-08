// transcriptionService.js

const WebSocket = require("ws");
const EventEmitter = require("events");

const SONIOX_API_KEY = process.env.SONIOX_API_KEY;

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.sentenceBuffer = ""; // ✅ Bafer za sakupljanje rečenice
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
        enable_endpoint_detection: true, // ✅ Detektuj kraj rečenice
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
          this.emit("transcriptionerror", message.error_message);
          return;
        }

        if (message.finished) {
          console.log("⏹️ Soniox stream finished");
          // Pošalji ostatak bafera ako nije prazan
          if (this.sentenceBuffer.trim()) {
            this.emit("transcription", this.sentenceBuffer.trim(), "customer");
            this.sentenceBuffer = "";
          }
          return;
        }

        if (!message.tokens || message.tokens.length === 0) return;

        for (const token of message.tokens) {
          if (token.text === "<end>") {
            // ✅ Signal za kraj rečenice
            if (this.sentenceBuffer.trim()) {
              this.emit("transcription", this.sentenceBuffer.trim(), "customer");
              this.sentenceBuffer = "";
            }
            continue;
          }

          if (token.translation_status && token.translation_status !== "none") continue;
          if (token.language && !["sr", "hr", "bs"].includes(token.language)) continue;

          // ✅ KORISTI channel_index IZ SONIOXA (samo customer)
          const channelIndex = token.channel_index ? token.channel_index[0] : 0;
          // const channel = channelIndex === 0 ? "customer" : "assistant"; // Ne treba više

          // ✅ Obradi samo customer kanal (channelIndex === 0)
          if (channelIndex !== 0) continue;

          if (token.is_final) {
            const text = token.text;
            // ✅ Dodaj tekst u bafer bez dodatnog razmaka ako već postoji interpunkcija
            const isPunctuation = /^[.,!?;:]$/.test(text);
            if (this.sentenceBuffer.length > 0 && !isPunctuation && !this.sentenceBuffer.endsWith(" ")) {
              this.sentenceBuffer += " ";
            }
            this.sentenceBuffer += text;

            // ✅ Alternativno: Pošalji odmah ako se završava sa jakom interpunkcijom
            if (/[.!?]$/.test(text.trim())) {
              const finalSentence = this.sentenceBuffer.trim();
              if (finalSentence) {
                this.emit("transcription", finalSentence, "customer");
                this.sentenceBuffer = "";
              }
            }
          }
        }
      } catch (err) {
        console.error("Error parsing Soniox response:", err.message);
      }
    });

    this.ws.on("error", (err) => {
      console.error("❌ Soniox WebSocket error:", err.message);
      this.emit("transcriptionerror", err.message);
    });

    this.ws.on("close", () => {
      console.log("🔚 Soniox WebSocket closed");
      // Pošalji ostatak bafera i na kraju
      if (this.sentenceBuffer.trim()) {
        this.emit("transcription", this.sentenceBuffer.trim(), "customer");
        this.sentenceBuffer = "";
      }
    });
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("⚠️ Soniox WebSocket not ready");
      return;
    }
    if (!(payload instanceof Buffer)) return;

    try {
      // ✅ Šalji stereo audio direktno Sonioxu
      this.ws.send(payload);
    } catch (err) {
      console.error("Audio send error:", err.message);
    }
  }
}

module.exports = TranscriptionService;