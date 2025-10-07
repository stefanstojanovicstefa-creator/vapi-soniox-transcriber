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
  transcriptionService.connect();

  ws.on("message", (data) => {
    // Sve poruke od Vapija su tekstualni JSON.
    try {
      const msg = JSON.parse(data.toString());

      // KLJUČNA ISPRAVKA: Sada rukujemo "transcription-data" porukom
      if (msg.type === "transcription-data") {
        // Transkribujemo SAMO audio od korisnika (channelIndex: 0)
        if (msg.channelIndex === 0 && msg.audioData) {
          // Audio je Base64 enkodiran, dekodiramo ga u Buffer
          const audioBuffer = Buffer.from(msg.audioData, 'base64');
          transcriptionService.send(audioBuffer);
        }
        return; // Ignorišemo audio asistenta (channelIndex: 1)
      }

      // Rukovanje tekstom AI asistenta
      if (msg.type === "model-output") {
        const assistantMessage = msg.message;
        ws.send(JSON.stringify({
          type: "transcriber-response",
          transcription: assistantMessage,
          channel: "assistant"
        }));
        console.log(`[ASSISTANT TRANSCRIPT]: ${assistantMessage}`);
        return;
      }
      
      if (msg.type === 'start') {
        console.log('Poziv je počeo. Spremno za govor korisnika.');
      }

    } catch (err) {
      console.error("Greška pri obradi poruke od Vapija:", err);
    }
  });

  transcriptionService.on("transcription", (text) => {
    if (!text) return;
    const response = {
      type: "transcriber-response",
      transcription: text,
      channel: "customer"
    };
    ws.send(JSON.stringify(response));
    console.log(`[CUSTOMER TRANSCRIPT]: ${text}`);
  });

  transcriptionService.on("transcriptionerror", (err) => {
    console.error("Greška iz transcriptionService:", err);
  });

  ws.on("close", () => {
    console.log("Vapi klijent se diskonektovao.");
    transcriptionService.close();
  });

  ws.on('error', (error) => {
    console.error('WebSocket greška:', error);
    transcriptionService.close();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server sluša na portu ${PORT}`);
});