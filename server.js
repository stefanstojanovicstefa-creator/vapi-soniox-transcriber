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
  console.log("Vapi se povezao");

  const transcriptionService = new TranscriptionService();
  transcriptionService.connect(); // ✅ Poveži se sa Soniox-om odmah

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
      transcriptionService.send(data);
    }
  });

  transcriptionService.on("transcription", (text, channel) => {
    if (!text || typeof text !== 'string') return;
    if (!channel || (channel !== "customer" && channel !== "assistant")) return;

    const response = {
      type: "transcriber-response",
      transcription: text,
      channel: channel
    };

    ws.send(JSON.stringify(response));
    console.log(`Sent to Vapi: [${channel}] ${text}`);
  });

  transcriptionService.on("transcriptionerror", (err) => {
    console.error("Transcription service error:", err);
    // ❌ NE ŠALJI OVO VAPIJU
    // ws.send(JSON.stringify({ type: "error", error: err }));
  });

  ws.on("close", () => {
    console.log("Vapi se diskonektovao");
    if (transcriptionService.ws) {
      transcriptionService.ws.close();
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});