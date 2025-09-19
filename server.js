// transcriptionService.js

const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const EventEmitter = require("events");
const path = require("path");

const SONIOX_API_KEY = process.env.SONIOX_API_KEY;
const PROTO_PATH = path.resolve(__dirname, "soniox.proto");

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.finalResult = { customer: "", assistant: "" };
    this.channel = "customer";

    const packageDefinition = protoLoader.loadSync(PROTO_PATH);
    const sonioxProto = grpc.loadPackageDefinition(packageDefinition).soniox;
    const credentials = grpc.credentials.createSsl();

    this.client = new sonioxProto.Transcribe("api.soniox.com:443", credentials);

    this.call = this.client.TranscribeStream((err, response) => {
      if (err) {
        console.error("Soniox gRPC error:", err.message);
        this.emit("transcriptionerror", err.message);
      }
    });

    this.call.on("data", (response) => {
      const { text, is_final } = response.result;

      if (text === "<end>") {
        this.emitTranscription(true);
        return;
      }

      if (text) {
        if (is_final) {
          this.finalResult[this.channel] += ` ${text}`;
          this.emitTranscription(true);
        } else {
          this.emit("interim", `${this.finalResult[this.channel]} ${text}`, this.channel);
        }
      }
    });

    this.call.on("error", (err) => {
      console.error("Soniox stream error:", err.message);
      this.emit("transcriptionerror", err.message);
    });

    this.call.on("end", () => {
      console.log("Soniox stream ended");
      this.emitTranscription(true);
    });

    // Inicijalizacija sesije - koristimo 16000 sample rate kao što Soniox zahteva
    this.call.write({
      api_key: SONIOX_API_KEY,
      config: {
        sample_rate_hertz: 16000,
        include_non_final: true,
        enable_endpoint_detection: true,
      },
    });
  }

  send(payload) {
    if (!(payload instanceof Buffer)) return;

    try {
      // Konvertujemo stereo 44100Hz u mono 16000Hz
      const monoBuffer = this.convertToMono16k(payload);
      
      if (monoBuffer.length > 0) {
        this.call.write({ audio: monoBuffer });
      }
    } catch (err) {
      console.error("Audio conversion error:", err.message);
    }
  }

  convertToMono16k(buffer) {
    // Pretvori buffer u Int16Array
    const int16Array = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
    
    // Uzimamo svaki 2. sample (levi kanal) i smanjujemo sample rate
    // 44100 -> 16000 = uzimamo svaki 2.756 sample (~3)
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
      monoBuffer.writeInt16LE(monoSamples[i], i * 2);
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