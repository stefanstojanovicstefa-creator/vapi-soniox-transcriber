const WebSocket = require("ws");
const EventEmitter = require("events");

class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.buffers = { customer: "", assistant: "" };
  }

  connect() {
    this.ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");

    this.ws.on("open", () => {
      console.log("✅ Connected to Soniox WebSocket");

      // Konfiguracija za stereo + srpski
      const config = {
        api_key: process.env.SONIOX_API_KEY,
        model: "stt-rt-preview-v2",
        audio_format: "pcm_s16le",
        sample_rate: 16000,
        num_channels: 2,                   // stereo
        language: "sr",                    // forsiraj srpski
        enable_language_identification: false,
        enable_speaker_diarization: false,
        enable_endpoint_detection: true,
        enable_non_final_tokens: false
      };

      this.ws.send(JSON.stringify(config));
      console.log("📤 Soniox config sent", config);
    });

    this.ws.on("message", (data) => {
      let pkt;
      try {
        pkt = JSON.parse(data);
      } catch {
        return;
      }

      if (pkt.error_code) {
        return this.emit("transcriptionerror", pkt.error_message);
      }
      if (pkt.finished) return;

      // Ako engine šalje `text` polje
      if (pkt.text && pkt.is_final) {
        this._emit(pkt.text.trim(), pkt.channel_index?.[0] || 0);
        return;
      }

      // Inače obrađujemo tokene
      if (Array.isArray(pkt.tokens)) {
        let c0 = "", c1 = "";

        for (const t of pkt.tokens) {
          if (!t.is_final || t.text === "<end>") continue;
          const idx = t.channel_index?.[0] ?? 0;
          if (idx === 0) c0 += t.text;
          else c1 += t.text;
        }

        if (c0) this.buffers.customer += c0;
        if (c1) this.buffers.assistant += c1;

        // Emituj kada prepoznamo kraj rečenice
        if (/[.!?]\s*$/.test(c0)) {
          this._emit(this.buffers.customer.trim(), 0);
          this.buffers.customer = "";
        }
        if (/[.!?]\s*$/.test(c1)) {
          this._emit(this.buffers.assistant.trim(), 1);
          this.buffers.assistant = "";
        }
      }
    });

    this.ws.on("error", (err) => {
      this.emit("transcriptionerror", err.message);
    });

    this.ws.on("close", () => {
      console.log("🔚 Soniox WebSocket closed");
    });
  }

  _emit(text, idx) {
    const channel = idx === 0 ? "customer" : "assistant";
    this.emit("transcription", text, channel);
  }

  send(buffer) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return console.warn("⚠️ Soniox WebSocket not ready");
    }
    if (!(buffer instanceof Buffer)) return;

    // Šaljemo interleaved stereo PCM direktno, bez modifikacija
    this.ws.send(buffer);
    console.log("➡️ Sent audio chunk to Soniox:", buffer.length);
  }
}

module.exports = TranscriptionService;