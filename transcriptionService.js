// transcriptionService.js

const WebSocket = require("ws");
const EventEmitter = require("events");

// Učitajte API ključ iz .env fajla
const SONIOX_API_KEY = process.env.SONIOX_API_KEY;

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.bufferBySpeaker = {}; // Primer: { "1": "Zdravo kako ", "2": "Dobro sam " }
    this.speakersMap = {
      "1": "customer",    // Govornik 1 se mapira na "customer"
      "2": "assistant"    // Govornik 2 se mapira na "assistant"
    };
    this.ws = null;
  }

  connect() {
    const url = "wss://stt-rt.soniox.com/transcribe-websocket";
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("✅ Connected to Soniox WebSocket");

      // --- ISPRAVLJENA KONFIGURACIJA ---
      const config = {
        api_key: SONIOX_API_KEY,
        model: "stt-rt-preview",         // Ažuriran model
        audio_format: "pcm_s16le",       // 16-bit linear PCM
        sample_rate: 16000,              // Očekivani sample rate
        num_channels: 1,                 // ✅ OBAVEZNO POLJE: audio je mono nakon konverzije
        language_hints: ["sr", "hr", "bs"], // Željeni jezici
        enable_speaker_diarization: true,
        enable_endpoint_detection: true,
        enable_non_final_tokens: true,   // Ispravljen naziv polja
        enable_language_identification: true  // Omogućeno prepoznavanje jezika za filtriranje
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
          // Preskačemo tokene koji su prevodi (za svaki slučaj)
          if (token.translation_status && token.translation_status !== "none") {
            continue;
          }

          // --- KLJUČNA ISPRAVKA: Filtriranje po jeziku ---
          // Ako token ima informaciju o jeziku i taj jezik nije jedan od željenih, preskoči ga.
          // Ovo sprečava da se engleske reči pojave u transkriptu.
          if (token.language && !["sr", "hr", "bs"].includes(token.language)) {
            continue;
          }

          const speakerId = token.speaker || "1"; // Default na govornika "1"
          if (!this.bufferBySpeaker[speakerId]) {
            this.bufferBySpeaker[speakerId] = "";
          }

          // Spajanje reči
          if (token.text !== "<end>") {
            const isPunctuation = /^[.,!?;:]$/.test(token.text);
            // Dodaj razmak samo ako prethodni bafer nije prazan i ako trenutni token nije znak interpunkcije
            if (this.bufferBySpeaker[speakerId].length > 0 && !isPunctuation) {
              this.bufferBySpeaker[speakerId] += " ";
            }
            this.bufferBySpeaker[speakerId] += token.text;
          }

          // Emituj transkripciju kada se detektuje kraj rečenice
          if (token.text === "<end>" || /[.!?]$/.test(token.text)) {
            const finalText = this.bufferBySpeaker[speakerId].replace("<end>", "").trim();
            if (finalText.length > 0) {
              const channel = this.speakersMap[speakerId] || "customer";
              console.log(`🗣️ [${channel}] ${finalText}`);
              this.emit("transcription", finalText, channel);
              this.bufferBySpeaker[speakerId] = ""; // Resetuj bafer za tog govornika
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
      // Vaša postojeća funkcija za konverziju. Pretpostavljamo da audio dolazi kao 44.1kHz stereo.
      const monoBuffer = this.convertToMono16k(payload);
      if (monoBuffer.length > 0) {
        this.ws.send(monoBuffer);
      }
    } catch (err) {
      console.error("Audio conversion error:", err.message);
    }
  }

  // Funkcija za downsampling i konverziju u mono (levi kanal)
  convertToMono16k(buffer) {
    // Originalni audio je verovatno 44.1kHz, 16-bit, 2 kanala (stereo)
    const originalSampleRate = 44100;
    const targetSampleRate = 16000;

    // Proveravamo da li je bafer validan
    if (buffer.length % 4 !== 0) {
        // Svaki stereo sempl ima 4 bajta (2 za levi, 2 za desni kanal)
        return Buffer.alloc(0);
    }

    const numSamples = buffer.length / 4;
    const resampledLength = Math.floor(numSamples * targetSampleRate / originalSampleRate);
    const monoBuffer = Buffer.alloc(resampledLength * 2); // 2 bajta po semplu (16-bit)

    for (let i = 0; i < resampledLength; i++) {
        const originalIndex = Math.floor(i * originalSampleRate / targetSampleRate);
        const byteOffset = originalIndex * 4; // 4 bajta po stereo semplu
        if (byteOffset + 1 < buffer.length) {
            // Čitamo samo levi kanal (prva 2 bajta od 4)
            const sample = buffer.readInt16LE(byteOffset);
            monoBuffer.writeInt16LE(sample, i * 2);
        }
    }

    return monoBuffer;
  }
}

module.exports = TranscriptionService;