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
  console.log("✅ Vapi povezan");

  const ts = new TranscriptionService();
  ts.connect();

  // Handshake – obaveštavamo Vapi da je transcriber spreman
  ws.send(
    JSON.stringify({
      type: "transcriber-response",
      transcription: "",
      channel: "customer",
    })
  );

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      // Binarni audio paket iz Vapi-ja (stereo interleaved PCM)
      console.log("🎙️ Received audio chunk from Vapi:", data.length);
      ts.send(data);
    }
    // NIJE tekstualni deo jer koristimo samo Soniox za transkripciju oba kanala
  });

  ts.on("transcription", (text, channel) => {
    // text može da dolazi kao 'customer' ili 'assistant'
    ws.send(
      JSON.stringify({
        type: "transcriber-response",
        transcription: text,
        channel: channel,
      })
    );
    console.log(`📨 [${channel}] ${text}`);
  });

  ts.on("transcriptionerror", (err) => {
    console.error("Transcription error:", err);
  });

  ws.on("close", () => {
    console.log("❌ Vapi diskonektovan");
    ts.ws && ts.ws.close();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});