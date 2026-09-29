import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const server = createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

async function translateWithGoogle(text, source, target) {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) throw new Error("Google API key is not configured.");

  const body = { q: text, target, format: "text" };
  if (source && source !== "auto") body.source = source;

  const response = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || `Google Translation API returned HTTP ${response.status}`);
  }

  const result = data?.data?.translations?.[0];
  if (!result?.translatedText) throw new Error("Google returned no translation.");

  return {
    translation: result.translatedText,
    detectedSourceLanguage: result.detectedSourceLanguage || source,
    engine: "google"
  };
}

async function translateWithFallback(text, source, target) {
  const fallbackSource = source && source !== "auto" ? source : "en";
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) +
    "&langpair=" +
    encodeURIComponent(fallbackSource + "|" + target);

  const response = await fetch(url, {
    headers: { "User-Agent": "RelayTranslationPrototype/0.2" }
  });

  const data = await response.json();

  if (!response.ok || !data?.responseData?.translatedText) {
    throw new Error("Translation service is temporarily unavailable.");
  }

  return {
    translation: data.responseData.translatedText,
    detectedSourceLanguage: fallbackSource,
    engine: "fallback"
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    googleTranslateConfigured: Boolean(process.env.GOOGLE_TRANSLATE_API_KEY),
    fallbackAvailable: true
  });
});

app.post("/api/translate", async (req, res) => {
  try {
    const { text, source = "en", target } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }

    if (!target || typeof target !== "string") {
      return res.status(400).json({ error: "target language is required" });
    }

    const cleanText = text.trim().slice(0, 5000);
    if (!cleanText) return res.status(400).json({ error: "text is required" });

    if (process.env.GOOGLE_TRANSLATE_API_KEY) {
      try {
        return res.json(await translateWithGoogle(cleanText, source, target));
      } catch (googleError) {
        console.warn("Google translation failed; using fallback:", googleError.message);
      }
    }

    res.json(await translateWithFallback(cleanText, source, target));
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: error.message || "Translation failed." });
  }
});

io.on("connection", (socket) => {
  socket.on("room:join", ({ roomId } = {}) => {
    if (!roomId || typeof roomId !== "string") return;
    const room = roomId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    if (!room) return;
    socket.join(room);
    socket.data.roomId = room;
    socket.to(room).emit("room:notice", { text: "Someone joined the conversation." });
  });

  socket.on("relay:message", (payload = {}) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const message = {
      id: String(payload.id || Date.now()).slice(0, 80),
      original: String(payload.original || "").slice(0, 5000),
      translation: String(payload.translation || "").slice(0, 5000),
      source: String(payload.source || "").slice(0, 12),
      target: String(payload.target || "").slice(0, 12),
      engine: String(payload.engine || "").slice(0, 20)
    };

    if (!message.original) return;
    socket.to(roomId).emit("relay:message", message);
  });
});

server.listen(port, () => {
  console.log(`Relay running at http://localhost:${port}`);
});
