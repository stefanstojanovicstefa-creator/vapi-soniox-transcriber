// server.js

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const TranscriptionService = require("./transcriptionService");
require("dotenv").config();

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

app.get("/", (req, res) => {
  res.send("Soniox Custom Transcriber for Vapi is running");
});

const wss = new WebSocket.Server({ server, path: "/api/custom-transcriber" });

wss.on("connection", (ws) => {
  console.log("✅ Vapi se povezao");

  const transcriptionService = new TranscriptionService();
  transcriptionService.connect();

  ws.on("message", (data, isBinary) => {
    // Ako poruka NIJE binarna, to je JSON sa informacijama
    if (!isBinary) {
      try {
        const msg = JSON.parse(data);
        
        // Vapi šalje tekstualnu poruku koju će asistent izgovoriti.
        // Ovu poruku odmah prosleđujemo nazad Vapi-ju kao transkript asistenta.
        if (msg.type === "model-output") {
          const text = msg.message;
          ws.send(JSON.stringify({
            type: "transcriber-response",
            transcription: text,
            channel: "assistant"
          }));
          console.log(`🗣️ [assistant] ${text}`);
        }
      } catch (err) {
        console.error("JSON parse error:", err);
      }
    } 
    // Ako je poruka binarna, to je audio stream
    else {
      // ✅ UVEK šalji audio Soniox-u.
      // transcriptionService će sam filtrirati na osnovu kanala.
      transcriptionService.send(data);
    }
  });

  // Ovaj događaj će se aktivirati SAMO za transkripte korisnika
  transcriptionService.on("transcription", (text) => {
    if (!text || typeof text !== 'string') return;

    const response = {
      type: "transcriber-response",
      transcription: text,
      channel: "customer" // Znamo da je uvek "customer" jer servis tako filtrira
    };

    ws.send(JSON.stringify(response));
    console.log(`📤 Sent to Vapi: [customer] ${text}`);
  });

  ws.on("close", () => {
    console.log("🔚 Vapi se diskonektovao");
    if (transcriptionService.ws) {
      transcriptionService.ws.close();
    }
  });

  ws.on("error", (err) => {
      console.error("Vapi WebSocket error:", err.message);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});