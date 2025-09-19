const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const TranscriptionService = require("./transcriptionService");
require("dotenv").config();

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

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});