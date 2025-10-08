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

  // ✅ Varijabla za praćenje poslednje poruke asistenta
  let lastAssistantMessage = "";

  const transcriptionService = new TranscriptionService();
  transcriptionService.connect();

  ws.on("message", (data, isBinary) => {
    if (!isBinary) {
      try {
        const msg = JSON.parse(data);
        
        if (msg.type === "model-output") {
          const text = msg.message;
          // ✅ Sačuvaj poruku koju će AI izgovoriti
          lastAssistantMessage = text.trim();
          
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
    } else {
      transcriptionService.send(data);
    }
  });

  transcriptionService.on("transcription", (text) => {
    if (!text || typeof text !== 'string') return;

    // ✅ Logika za detekciju eha
    // Ako je transkript korisnika sadržan u poslednjoj poruci asistenta, ignoriši ga.
    const isEcho = lastAssistantMessage.toLowerCase().includes(text.toLowerCase());

    if (isEcho && text.length > 0) {
      console.log(`🔇 Ignorisan transkript jer je verovatno eho: "${text}"`);
      // Opciono: resetuj `lastAssistantMessage` da se ne bi desilo da se blokira stvarni govor korisnika
      // lastAssistantMessage = ""; 
      return;
    }

    const response = {
      type: "transcriber-response",
      transcription: text,
      channel: "customer"
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