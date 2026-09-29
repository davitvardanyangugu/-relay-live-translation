import "dotenv/config";
import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    googleTranslateConfigured: Boolean(process.env.GOOGLE_TRANSLATE_API_KEY)
  });
});

app.post("/api/translate", async (req, res) => {
  try {
    const { text, source = "auto", target } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }

    if (!target || typeof target !== "string") {
      return res.status(400).json({ error: "target language is required" });
    }

    const key = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!key) {
      return res.status(503).json({
        error: "Google Translation is not configured. Set GOOGLE_TRANSLATE_API_KEY on the server."
      });
    }

    const body = {
      q: text.slice(0, 5000),
      target,
      format: "text"
    };

    if (source && source !== "auto") {
      body.source = source;
    }

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
      return res.status(response.status).json({
        error: data?.error?.message || `Google Translation API returned HTTP ${response.status}`
      });
    }

    const result = data?.data?.translations?.[0];

    if (!result?.translatedText) {
      return res.status(502).json({ error: "Google returned no translation." });
    }

    res.json({
      translation: result.translatedText,
      detectedSourceLanguage: result.detectedSourceLanguage || source
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Translation failed." });
  }
});

app.listen(port, () => {
  console.log(`Relay running at http://localhost:${port}`);
});
