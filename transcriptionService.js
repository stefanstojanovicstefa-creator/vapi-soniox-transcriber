// transcriptionService.js

const WebSocket = require("ws");
const EventEmitter = require("events");

const SONIOX_API_KEY = process.env.SONIOX_API_KEY;

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.bufferBySpeaker = {}; // { "1": "Zdravo kako ", "2": "Dobro sam " }
    this.speakersMap = {
      "1": "You",
      "2": "Assistant"
    };
    this.ws = null;
  }

  connect() {
    const url = "wss://stt-rt.soniox.com/transcribe-websocket";
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("✅ Connected to Soniox WebSocket");

      const config = {
        api_key: SONIOX_API_KEY,
        model: "stt-rt-preview",
        audio_format: "pcm_s16le",
        sample_rate: 16000,
        num_channels: 1,
        language_hints: ["sr", "en"],
        enable_speaker_diarization: true,
        enable_endpoint_detection: true,
        enable_non_final_tokens: true,
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
          return;
        }

        if (!message.tokens || message.tokens.length === 0) return;

        for (const token of message.tokens) {
          const speakerId = token.speaker || "unknown";
          if (!this.bufferBySpeaker[speakerId]) {
            this.bufferBySpeaker[speakerId] = "";
          }

          // Spajanje tokena
          if (token.text !== "<end>") {
            const isPunctuation = /^[.,!?;:]$/.test(token.text);
            if (this.bufferBySpeaker[speakerId].length > 0 && !isPunctuation) {
              this.bufferBySpeaker[speakerId] += " ";
            }
            this.bufferBySpeaker[speakerId] += token.text;
          }

          // Emituj kada se detektuje kraj izgovora
          if (token.text === "<end>" || /[.!?]$/.test(token.text)) {
            const finalText = this.bufferBySpeaker[speakerId].replace("<end>", "").trim();
            if (finalText.length > 0) {
              const speakerLabel = this.speakersMap[speakerId] || `Speaker ${speakerId}`;
              const channel = speakerId === "1" ? "customer" : "assistant";

              console.log(`🗣️ ${speakerLabel}: ${finalText}`);
              this.emit("transcription", finalText, channel);

              this.bufferBySpeaker[speakerId] = "";
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
    });
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("⚠️ Soniox WebSocket not ready");
      return;
    }

    if (!(payload instanceof Buffer)) return;

    try {
      const monoBuffer = this.convertToMono16k(payload);
      if (monoBuffer.length > 0) {
        this.ws.send(monoBuffer);
      }
    } catch (err) {
      console.error("Audio conversion error:", err.message);
    }
  }

  convertToMono16k(buffer) {
    const int16Array = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
    const step = 44100 / 16000;
    const monoSamples = [];

    for (let i = 0; i < int16Array.length; i += step * 2) {
      const index = Math.floor(i);
      if (index < int16Array.length) {
        monoSamples.push(int16Array[index]);
      }
    }

    const monoBuffer = Buffer.alloc(monoSamples.length * 2);
    for (let i = 0; i < monoSamples.length; i++) {
      if (i * 2 + 1 < monoBuffer.length) {
        monoBuffer.writeInt16LE(monoSamples[i], i * 2);
      }
    }

    return monoBuffer;
  }
}

module.exports = TranscriptionService;