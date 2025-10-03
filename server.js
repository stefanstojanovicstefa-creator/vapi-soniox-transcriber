// server.js

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const TranscriptionService = require("./transcriptionService");
require("dotenv").config();

// Global error handlers
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
  console.log("Vapi se povezao");

  // Kreiraj novu instancu za svaku Vapi konekciju
  const transcriptionService = new TranscriptionService();
  
  // ODMAH POZIVAMO connect() da se povežemo sa Soniox-om
  transcriptionService.connect();

  ws.on("message", (data, isBinary) => {
    if (!isBinary) {
      try {
        const msg = JSON.parse(data);
        if (msg.type === "start") {
          console.log("Start message received:", msg);
        }
      } catch (err) {
        console.error("JSON parse error:", err);
      }
    } else {
      // Pošalji audio Sonioxu (ako je spreman)
      transcriptionService.send(data);
    }
  });

  // Slušaj finalne transkripte od Soniox-a i šalji Vapiju
  transcriptionService.on("transcription", (text, channel) => {
    // Validacija poruke pre slanja Vapiju
    if (!text || typeof text !== 'string') {
      console.error("Invalid transcription text:", text);
      return;
    }

    if (!channel || (channel !== "customer" && channel !== "assistant")) {
      console.error("Invalid channel:", channel);
      return;
    }

    const response = {
      type: "transcriber-response",
      transcription: text,
      channel: channel
    };

    ws.send(JSON.stringify(response));
    console.log(`Sent to Vapi: [${channel}] ${text}`);
  });

  // Slušaj eventualne greške od Soniox-a
  transcriptionService.on("transcriptionerror", (err) => {
    console.error("Transcription service error:", err);
    ws.send(JSON.stringify({ type: "error", error: err }));
  });

  ws.on("close", () => {
    console.log("Vapi se diskonektovao");
    // Zatvori Soniox konekciju ako postoji
    if (transcriptionService.ws) {
      transcriptionService.ws.close();
    }
  });
});

// Bind na 0.0.0.0 za Render
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});