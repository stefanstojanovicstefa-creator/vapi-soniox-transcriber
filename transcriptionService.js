// transcriptionService.js

const WebSocket = require("ws");
const EventEmitter = require("events");

const SONIOX_API_KEY = process.env.SONIOX_API_KEY;

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.finalBuffer = "";
  }

  connect() {
    const url = "wss://stt-rt.soniox.com/transcribe-websocket";
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log("✅ Povezan na Soniox WebSocket");

      const config = {
        api_key: SONIOX_API_KEY,
        model: "stt-rt-preview-v2",
        audio_format: "pcm_s16le",
        sample_rate: 16000,
        // KLJUČNA IZMENA: Vraćamo na 1 kanal, jer šaljemo samo audio korisnika
        num_channels: 1, 
        language_hints: ["sr", "hr", "bs"],
        enable_endpoint_detection: true,
        enable_non_final_tokens: false, // Šaljemo Vapiju samo finalne transkripte
      };

      this.ws.send(JSON.stringify(config));
    });

    this.ws.on("message", (data) => {
      try {
        const message = JSON.parse(data);

        if (message.error_code) {
          console.error(`❌ Soniox greška: ${message.error_message}`);
          this.emit("transcriptionerror", message.error_message);
          return;
        }

        // Gradimo kompletan finalni transkript iz reči
        let final_text = message.final_words.map(word => word.text).join("");
        if (final_text) {
             // Uklanjamo razmake sa početka i kraja pre slanja
            const trimmedText = final_text.trim();
            if (trimmedText) {
                this.emit("transcription", trimmedText);
            }
        }

      } catch (err) {
        console.error("Greška pri parsiranju Soniox odgovora:", err.message);
      }
    });

    this.ws.on("error", (err) => {
      console.error("❌ Soniox WebSocket greška:", err.message);
      this.emit("transcriptionerror", err.message);
    });

    this.ws.on("close", () => {
      console.log("🔚 Soniox WebSocket konekcija zatvorena");
    });
  }

  send(audioBuffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(audioBuffer);
    } else {
      console.warn("⚠️ Soniox WebSocket nije spreman za slanje audio podataka.");
    }
  }

  close() {
    if (this.ws) {
        this.ws.close();
    }
  }
}

module.exports = TranscriptionService;