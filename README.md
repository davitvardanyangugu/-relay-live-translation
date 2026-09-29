# Relay — Live Translation

Relay is a small real-time translation prototype for **texting** and **voice conversations**.

It uses Google's official **Cloud Translation - Basic (v2)** API for translation. The browser handles speech recognition and speech synthesis for the smallest working prototype.

## What works

- 💬 Text messages translated with Google Cloud Translation
- 📞 Push-to-talk voice translation
- 🎙 Browser speech-to-text
- 🔊 Browser text-to-speech for the translated result
- 🌍 English, Armenian, Russian, French, German, Spanish, Italian, Portuguese, Arabic, Georgian, and Turkish in the UI
- 🔐 Google API key stays on the server and is never committed to the repository

## Important limitation

The current **Call mode is an in-app push-to-talk conversation**. A normal website cannot directly intercept the audio from cellular calls, FaceTime, WhatsApp, Telegram, or other calling apps.

A future two-person Relay call can use WebRTC for the audio connection, then translate each speaker's transcript through the same Google Translation backend.

## Google Cloud setup

1. Create or select a Google Cloud project.
2. Enable **Cloud Translation API**.
3. Create an API key for the project.
4. Restrict the key to the Cloud Translation API.
5. Copy `.env.example` to `.env`.
6. Put your key in `GOOGLE_TRANSLATE_API_KEY`.

Never put the API key in `public/app.js` and never commit `.env`.

## Run locally

```bash
npm install
cp .env.example .env
# edit .env and add your Google API key
npm start
```

Then open:

```
http://localhost:3000
```

## Translation endpoint

`POST /api/translate`

Example:

```json
{
  "text": "Hello",
  "source": "en",
  "target": "hy"
}
```

## Next step

Deploy the Node server to a host such as Render or Railway, add `GOOGLE_TRANSLATE_API_KEY` as a server environment variable, and then Relay can be tested from a phone or tablet over HTTPS.
