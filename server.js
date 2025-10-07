const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const TranscriptionService = require("./transcriptionService");
require("dotenv").config();

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
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

  // inicijalni handshake
  ws.send(
    JSON.stringify({
      type: "transcriber-response",
      transcription: "",
      channel: "customer",
    })
  );

  ws.on("message", (data, isBinary) => {
    if (!isBinary) {
      try {
        const msg = JSON.parse(data);
        if (msg.type === "start") {
          console.log("Start message received:", msg);
        } else if (msg.type === "model-output") {
          const text = msg.message;
          ws.send(
            JSON.stringify({
              type: "transcriber-response",
              transcription: text,
              channel: "assistant",
            })
          );
          console.log(`🗣️ [assistant] ${text}`);
        }
      } catch (err) {
        console.error("JSON parse error:", err);
      }
    } else {
      console.log("🎙️ Received audio chunk:", data.length);
      transcriptionService.send(data);
    }
  });

  transcriptionService.on("transcription", (text, channel) => {
    if (!text || typeof text !== "string") return;

    const response = {
      type: "transcriber-response",
      transcription: text,
      channel: channel,
    };

    ws.send(JSON.stringify(response));
    console.log(`📨 Sent to Vapi: [${channel}] ${text}`);
  });

  transcriptionService.on("transcriptionerror", (err) => {
    console.error("Transcription service error:", err);
  });

  ws.on("close", () => {
    console.log("❌ Vapi se diskonektovao");
    if (transcriptionService.ws) {
      transcriptionService.ws.close();
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});