// server.js

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const TranscriptionService = require("./transcriptionService");
require("dotenv").config();

process.on('uncaughtException', (err) => {
  console.error('Neuhvaćena greška:', err);
});

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

app.get("/", (req, res) => {
  res.send("Soniox Custom Transcriber za Vapi je pokrenut");
});

const wss = new WebSocket.Server({ server, path: "/api/custom-transcriber" });

wss.on("connection", (ws) => {
  console.log("Vapi klijent se povezao.");

  const transcriptionService = new TranscriptionService();
  transcriptionService.connect();

  ws.on("message", (data) => {
    try {
      // SVE poruke od Vapija su tekstualne (JSON), nikad binarne.
      const msg = JSON.parse(data);

      // KLJUČNA IZMENA: Rukovanje audio podacima koje Vapi šalje
      if (msg.type === "transcription-data") {
        // Transkribujemo SAMO audio od korisnika (channelIndex: 0)
        if (msg.channelIndex === 0 && msg.audioData) {
          // Audio je Base64 enkodiran, moramo ga dekodirati u Buffer
          const audioBuffer = Buffer.from(msg.audioData, 'base64');
          transcriptionService.send(audioBuffer);
        }
        // Audio od asistenta (channelIndex: 1) ignorišemo
        return; 
      }
      
      // Rukovanje tekstom AI asistenta
      if (msg.type === "model-output") {
        const assistantMessage = msg.message;
        // Odmah šaljemo Vapiju savršen transkript za asistenta
        ws.send(JSON.stringify({
          type: "transcriber-response",
          transcription: assistantMessage,
          channel: "assistant"
        }));
        console.log(`[ASSISTANT TRANSCRIPT SENT]: ${assistantMessage}`);
        return;
      }
      
      // Ostale poruke, npr. 'start'
      if (msg.type === 'start') {
          console.log('Start poruka primljena:', msg);
      }

    } catch (err) {
      console.error("Greška pri obradi poruke od Vapija:", err);
    }
  });

  // Slušamo događaj 'transcription' iz našeg servisa
  transcriptionService.on("transcription", (text) => {
    if (!text) return;

    const response = {
      type: "transcriber-response",
      transcription: text,
      channel: "customer" // Uvek je 'customer' jer samo njega transkribujemo
    };

    ws.send(JSON.stringify(response));
    console.log(`[CUSTOMER TRANSCRIPT SENT]: ${text}`);
  });

  transcriptionService.on("transcriptionerror", (err) => {
    console.error("Greška iz transcriptionService:", err);
  });

  ws.on("close", () => {
    console.log("Vapi klijent se diskonektovao.");
    transcriptionService.close(); // Obavezno zatvoriti konekciju ka Sonioxu
  });

  ws.on('error', (error) => {
    console.error('WebSocket greška:', error);
    transcriptionService.close();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server sluša na portu ${PORT}`);
});