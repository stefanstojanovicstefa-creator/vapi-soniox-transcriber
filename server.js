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

  // ZASTAVICA: Služi kao "kapija". Ako je true, audio se ne šalje Sonioxu.
  let isAssistantSpeaking = false;

  ws.on("message", (data, isBinary) => {
    // KLJUČNA ISPRAVKA: Razlikujemo binarne (audio) i tekstualne (JSON) poruke
    if (isBinary) {
      // Stigli su audio podaci. Šaljemo ih Sonioxu SAMO ako asistent ne priča.
      if (!isAssistantSpeaking) {
        transcriptionService.send(data);
      }
    } else {
      // Stigla je tekstualna poruka, mora biti JSON.
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "model-output") {
          // Asistent će sada govoriti.
          isAssistantSpeaking = true; // ZATVORI KAPIJU
          const assistantMessage = msg.message;
          
          // Odmah šaljemo savršen transkript za asistenta
          ws.send(JSON.stringify({
            type: "transcriber-response",
            transcription: assistantMessage,
            channel: "assistant"
          }));
          console.log(`[ASSISTANT TRANSCRIPT]: ${assistantMessage}`);

        } else if (msg.type === 'start') {
          console.log('Poziv je počeo. Spremno za govor korisnika.');
          isAssistantSpeaking = false; // OTVORI KAPIJU na početku poziva

        } else if (msg.type === 'user-interrupted') {
          console.log('Korisnik je prekinuo asistenta.');
          isAssistantSpeaking = false; // OTVORI KAPIJU jer korisnik sada govori
        }

      } catch (err) {
        console.error("Greška pri parsiranju JSON poruke od Vapija:", err);
      }
    }
  });

  // Kada stigne transkript od Sonioxa, to je sigurno korisnik
  transcriptionService.on("transcription", (text) => {
    // Čim korisnik progovori, znamo da asistent više ne priča.
    isAssistantSpeaking = false; // OTVORI KAPIJU
    
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