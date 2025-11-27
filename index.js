import express from "express";
import cors from "cors";
import { YoutubeTranscript } from "youtube-transcript";

const app = express();
app.use(cors());
app.use(express.json());

// Multiple free RapidAPI keys - rotate automatically
const RAPIDAPI_KEYS = [
  "bf2adba532mshf135f7b5951cc75p1a0034jsn73a386812c51",
  "73be206a17msh93a2475758f2bd6p1209f8jsnacf307b09143",
  "a4810c5486msh27ce83ad0d05b4cp152846jsnb15b75d825f2",
  "21818ba93fmshbab3d5254cfc0bep1835eajsnd79f71e4944f",
  "1d0636d328mshb7289fc31c3dcf4p133ffcjsn3c739d940c77",
  "61476cd88fmsh74734533a14054ap17b76bjsnc9854a9fbd33"
];
let currentKeyIndex = 0;
const LANGS = ["en", "en-US", "en-GB", "hi", "hi-IN", "auto"];

app.get("/", (req, res) => {
  res.send("YouTube Transcript Proxy + Telegram Proxy for n8n HF Spaces running!");
});

// Telegram Proxy Endpoint for n8n HF Spaces
app.post("/telegram/sendMessage", async (req, res) => {
  try {
    const { token, chat_id, text, parse_mode } = req.body;
    
    if (!token || !chat_id || !text) {
      return res.status(400).json({ 
        ok: false, 
        error: "Missing required fields: token, chat_id, text" 
      });
    }
    
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        chat_id, 
        text, 
        parse_mode: parse_mode || "Markdown" 
      })
    });
    
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

async function tryRapidAPI(videoId) {
  for (let i = 0; i < RAPIDAPI_KEYS.length; i++) {
    const keyIndex = (currentKeyIndex + i) % RAPIDAPI_KEYS.length;
    try {
      const response = await fetch(
        `https://youtube-transcripts.p.rapidapi.com/youtube/transcript?videoId=${videoId}&lang=en&chunkSize=500`,
        {
          headers: {
            "x-rapidapi-key": RAPIDAPI_KEYS[keyIndex],
            "x-rapidapi-host": "youtube-transcripts.p.rapidapi.com"
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.content && data.content.length > 0) {
          currentKeyIndex = (keyIndex + 1) % RAPIDAPI_KEYS.length;
          return data.content.map(item => ({
            text: item.text,
            offset: item.offset,
            duration: item.duration
          }));
        }
      }
    } catch (err) {}
  }
  return null;
}

app.get("/transcript/:id", async (req, res) => {
  const id = req.params.id;

  for (const lang of LANGS) {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(id, { lang });
      return res.json({ method: "scraper", lang, transcript });
    } catch (err) {}
  }

  const rapidTranscript = await tryRapidAPI(id);
  if (rapidTranscript) {
    return res.json({ method: "rapidapi", transcript: rapidTranscript });
  }

  try {
    const timedtextUrl = `https://video.google.com/timedtext?lang=en&v=${id}&kind=asr`;
    const response = await fetch(timedtextUrl);
    const xml = await response.text();
    if (xml.includes('<transcript>')) {
      return res.json({ method: "timedtext", transcript: xml });
    }
  } catch (err) {}

  return res.status(404).json({ error: "No transcript found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
