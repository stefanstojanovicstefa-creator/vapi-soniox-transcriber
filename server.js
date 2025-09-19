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

  const transcriptionService = new TranscriptionService();
  transcriptionService.connect(); // <-- ODMAH POVEZUJEMO NA SONIOX

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
    ws.send(JSON.stringify({ type: "transcriber-response", transcription: text, channel }));
  });

  transcriptionService.on("interim", (text, channel) => {
    ws.send(JSON.stringify({ type: "transcriber-response", transcription: text, channel, isInterim: true }));
  });

  transcriptionService.on("transcriptionerror", (err) => {
    ws.send(JSON.stringify({ type: "error", error: err }));
  });

  ws.on("close", () => {
    console.log("Vapi se diskonektovao");
  });
});

// Bind to 0.0.0.0 for Render
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});