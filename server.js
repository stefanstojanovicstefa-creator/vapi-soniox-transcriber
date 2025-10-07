// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const TranscriptionService = require("./transcriptionService");
require("dotenv").config();

process.on('uncaughtException', (err) => {
  console.error('Neuhvaćena sistemska greška:', err);
});

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

app.get("/", (req, res) => {
  res.send("Soniox Custom Transcriber za Vapi je pokrenut");
});

const wss = new WebSocket.Server({ server, path: "/api/custom-transcriber" });

wss.on("connection", (ws) => {
  console.log("✅ Vapi klijent se povezao.");

  const transcriptionService = new TranscriptionService();
  let isConnected = false;

  ws.on("message", (data, isBinary) => {
    // Ako je binarna poruka, to je audio
    if (isBinary || Buffer.isBuffer(data)) {
      // Konektuj se na Soniox samo kad stigne prvi audio
      if (!isConnected) {
        transcriptionService.connect();
        isConnected = true;
      }
      // Pošalji audio direktno Sonioxu
      transcriptionService.send(data);
      return;
    }

    // Ako nije binarna, pokušaj parsirati kao JSON
    try {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'start') {
        console.log('📞 Poziv je počeo. Spremno za audio stream.');
      }
      
      // Rukovanje tekstom AI asistenta
      if (msg.type === "model-output") {
        const assistantMessage = msg.message;
        // Pošalji asistent transkript nazad Vapiju
        ws.send(JSON.stringify({
          type: "transcriber-response",
          transcription: assistantMessage,
          channel: "assistant"
        }));
        console.log(`🤖 [ASSISTANT]: ${assistantMessage}`);
      }

    } catch (err) {
      console.error("⚠️ Greška pri parsiranju JSON poruke:", err.message);
    }
  });

  // Kada Soniox pošalje transkript korisnika
  transcriptionService.on("transcription", (text) => {
    if (!text || text.trim().length === 0) return;
    
    const response = {
      type: "transcriber-response",
      transcription: text.trim(),
      channel: "customer"
    };
    
    ws.send(JSON.stringify(response));
    console.log(`👤 [CUSTOMER]: ${text}`);
  });

  transcriptionService.on("transcriptionerror", (err) => {
    console.error("❌ Soniox greška:", err);
  });

  ws.on("close", () => {
    console.log("👋 Vapi klijent se diskonektovao.");
    transcriptionService.close();
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket greška:', error);
    transcriptionService.close();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server sluša na portu ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/api/custom-transcriber`);
});