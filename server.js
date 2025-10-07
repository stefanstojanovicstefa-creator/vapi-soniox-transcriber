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

  // Handshake ka Vapi-ju: transcriber spreman
  ws.send(
    JSON.stringify({
      type: "transcriber-response",
      transcription: "",
      channel: "customer",
    })
  );

  ws.on("message", (data, isBinary) => {
    if (!isBinary) {
      // Tekstualne poruke od Vapi-ja
      try {
        const msg = JSON.parse(data);

        if (msg.type === "start") {
          console.log("Start message received:", msg);
          return;
        }

        if (msg.type === "model-output") {
          // AI odgovor šaljemo Vapiju kao assistant (NE ide u Soniox)
          const text = msg.message || "";
          if (text.trim()) {
            ws.send(
              JSON.stringify({
                type: "transcriber-response",
                transcription: text,
                channel: "assistant",
              })
            );
            console.log(`🗣️ [assistant -> Vapi] ${text}`);
          }
          return;
        }
      } catch (err) {
        console.error("JSON parse error:", err);
      }
    } else {
      // Binarni audio: interleaved stereo s16le @16k koji šalje Vapi
      console.log("🎙️ Received audio chunk from Vapi:", data.length);
      transcriptionService.send(data);
    }
  });

  // Transkript iz Soniox-a (samo customer's channel)
  transcriptionService.on("transcription", (text) => {
    if (!text || typeof text !== "string") return;

    const response = {
      type: "transcriber-response",
      transcription: text,
      channel: "customer",
    };

    ws.send(JSON.stringify(response));
    console.log(`📨 [customer -> Vapi] ${text}`);
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