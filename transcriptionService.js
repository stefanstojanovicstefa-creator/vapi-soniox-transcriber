// transcriptionService.js

const WebSocket = require("ws");
const EventEmitter = require("events");

const SONIOX_API_KEY = process.env.SONIOX_API_KEY;

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.finalResult = { customer: "", assistant: "" };
    this.channel = "customer";
    this.ws = null;
  }

  connect() {
    const url = "wss://stt-rt.soniox.com/transcribe-websocket";

    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("Connected to Soniox WebSocket");

      // Pošalji konfiguraciju
      const config = {
        api_key: SONIOX_API_KEY,
        model: "stt-rt-preview",
        audio_format: "pcm_s16le",
        sample_rate: 16000,
        num_channels: 1,
        language_hints: ["sr"], // eksplicitno srpski
        enable_endpoint_detection: true,
        enable_non_final_tokens: true,
      };

      this.ws.send(JSON.stringify(config));
    });

    this.ws.on("message", (data) => {
      try {
        const response = JSON.parse(data);

        if (response.error_message) {
          console.error("Soniox error:", response.error_message);
          this.emit("transcriptionerror", response.error_message);
          return;
        }

        if (response.finished) {
          console.log("Soniox stream finished");
          this.emitTranscription(true);
          return;
        }

        const tokens = response.tokens || [];
        let textBuffer = "";
        let isFinalSegment = false;

        for (const token of tokens) {
          if (token.text === "<end>") {
            isFinalSegment = true;
            continue;
          }

          if (token.is_final) {
            this.finalResult[this.channel] += ` ${token.text}`;
          } else {
            textBuffer += ` ${token.text}`;
          }
        }

        // Emituj non-final ako ima teksta
        if (textBuffer.trim()) {
          this.emit("interim", `${this.finalResult[this.channel]} ${textBuffer}`, this.channel);
        }

        // Emituj final ako je detektovan kraj
        if (isFinalSegment) {
          this.emitTranscription(true);
        }
      } catch (err) {
        console.error("Error parsing Soniox response:", err);
      }
    });

    this.ws.on("error", (err) => {
      console.error("Soniox WebSocket error:", err.message);
      this.emit("transcriptionerror", err.message);
    });

    this.ws.on("close", () => {
      console.log("Soniox WebSocket closed");
      this.emitTranscription(true);
    });
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("Soniox WebSocket not ready");
      return;
    }

    if (!(payload instanceof Buffer)) return;

    try {
      // Konvertuj stereo 44100Hz u mono 16000Hz
      const monoBuffer = this.convertToMono16k(payload);

      if (monoBuffer.length > 0) {
        this.ws.send(monoBuffer);
      }
    } catch (err) {
      console.error("Audio conversion error:", err.message);
    }
  }

  convertToMono16k(buffer) {
    // Pretvori buffer u Int16Array
    const int16Array = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);

    // Uzimamo svaki 2. sample (levi kanal) i smanjujemo sample rate
    const step = Math.round(44100 / 16000);
    const monoSamples = [];

    for (let i = 0; i < int16Array.length; i += step * 2) {
      if (i < int16Array.length) {
        monoSamples.push(int16Array[i]); // uzimamo levi kanal
      }
    }

    // Kreiramo novi buffer
    const monoBuffer = Buffer.alloc(monoSamples.length * 2);
    for (let i = 0; i < monoSamples.length; i++) {
      // Provera granica pre pisanja
      if (i * 2 + 1 < monoBuffer.length) {
        monoBuffer.writeInt16LE(monoSamples[i], i * 2);
      }
    }

    return monoBuffer;
  }

  emitTranscription(isFinal = false) {
    const transcript = this.finalResult[this.channel]?.trim();
    if (transcript) {
      if (isFinal) {
        this.emit("transcription", transcript, this.channel);
        this.finalResult[this.channel] = "";
      }
    }
  }
}

module.exports = TranscriptionService;