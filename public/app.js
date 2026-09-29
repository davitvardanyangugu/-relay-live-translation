const $ = (id) => document.getElementById(id);

const sourceLang = $("sourceLang");
const targetLang = $("targetLang");
const messageInput = $("messageInput");
const messages = $("messages");
const apiState = $("apiState");
const sendTextButton = $("sendText");
const micButton = $("micButton");

let googleBackendReady = false;

function decodeHtml(value) {
  const el = document.createElement("textarea");
  el.innerHTML = value;
  return el.value;
}

function selectedLocale(select) {
  return select.options[select.selectedIndex]?.dataset.locale || select.value;
}

function languageName(select) {
  return select.options[select.selectedIndex]?.textContent || select.value;
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
}

async function googleTranslate(text, source = sourceLang.value, target = targetLang.value) {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source, target })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Google translation failed");
  }

  return {
    text: decodeHtml(data.translation),
    detectedSourceLanguage: data.detectedSourceLanguage,
    engine: "google"
  };
}

async function fallbackTranslate(text, source = sourceLang.value, target = targetLang.value) {
  const safeSource = source === "auto" ? "en" : source;

  if (safeSource === target) {
    return { text, detectedSourceLanguage: safeSource, engine: "fallback" };
  }

  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) +
    "&langpair=" +
    encodeURIComponent(safeSource + "|" + target);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || !data?.responseData?.translatedText) {
    throw new Error("Fallback translation service is unavailable right now.");
  }

  return {
    text: decodeHtml(data.responseData.translatedText),
    detectedSourceLanguage: safeSource,
    engine: "fallback"
  };
}

async function translateText(text, source = sourceLang.value, target = targetLang.value) {
  if (googleBackendReady) {
    try {
      return await googleTranslate(text, source, target);
    } catch (error) {
      console.warn("Google backend failed, trying fallback:", error);
    }
  }

  return fallbackTranslate(text, source, target);
}

async function checkApi() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const data = await response.json();

    googleBackendReady = Boolean(data.googleTranslateConfigured);

    if (googleBackendReady) {
      apiState.textContent = "● Google Translation ready";
      apiState.title = "Using Google Cloud Translation";
    } else {
      apiState.textContent = "◐ Demo fallback ready";
      apiState.title = "Google API key is not configured yet, so Relay is using a fallback translator.";
    }
  } catch {
    googleBackendReady = false;
    apiState.textContent = "◐ Demo fallback ready";
    apiState.title = "The Google backend is not online yet, so Relay is using a fallback translator.";
  }
}

checkApi();

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));

    button.classList.add("active");
    $(button.dataset.tab + "Tab").classList.add("active");
  });
});

$("swap").addEventListener("click", () => {
  if (sourceLang.value === "auto") {
    toast("Choose a source language before swapping.");
    return;
  }

  const oldSource = sourceLang.value;
  const oldTarget = targetLang.value;

  const newSource = [...sourceLang.options].find((o) => o.value === oldTarget);
  const newTarget = [...targetLang.options].find((o) => o.value === oldSource);

  if (newSource && newTarget) {
    sourceLang.value = oldTarget;
    targetLang.value = oldSource;
    toast(languageName(sourceLang) + " → " + languageName(targetLang));
  }
});

function addBubble(type, label, text) {
  const empty = messages.querySelector(".empty");
  if (empty) empty.remove();

  const bubble = document.createElement("div");
  bubble.className = "message " + type;

  const caption = document.createElement("span");
  caption.className = "label";
  caption.textContent = label;

  const body = document.createElement("div");
  body.textContent = text;

  bubble.append(caption, body);
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

async function sendText() {
  const text = messageInput.value.trim();
  if (!text) {
    toast("Type something first.");
    return;
  }

  sendTextButton.disabled = true;
  sendTextButton.textContent = "Translating…";

  addBubble("source", "YOU", text);
  messageInput.value = "";

  try {
    const result = await translateText(text);
    const label =
      result.engine === "google"
        ? "GOOGLE TRANSLATION"
        : "DEMO TRANSLATION";
    addBubble("translation", label, result.text);
  } catch (error) {
    addBubble("translation", "ERROR", error.message);
  } finally {
    sendTextButton.disabled = false;
    sendTextButton.textContent = "Translate";
  }
}

sendTextButton.addEventListener("click", sendText);

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendText();
  }
});

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let listening = false;

function setCallState(title, hint, live = false) {
  $("callState").textContent = title;
  $("callHint").textContent = hint;
  $("pulse").classList.toggle("live", live);
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    toast("Text-to-speech is not available in this browser.");
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = selectedLocale(targetLang);
  window.speechSynthesis.speak(utterance);
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    listening = true;
    micButton.textContent = "■ Stop";
    micButton.classList.add("recording");
    setCallState(
      "Listening",
      "Speak naturally. Relay will translate when you pause.",
      true
    );
  };

  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;

      if (event.results[i].isFinal) {
        finalText += text;
      } else {
        interimText += text;
      }
    }

    $("heardText").textContent = finalText || interimText || "—";

    if (finalText) {
      translateVoice(finalText);
    }
  };

  recognition.onerror = (event) => {
    setCallState("Microphone error", event.error, false);
  };

  recognition.onend = () => {
    listening = false;
    micButton.textContent = "🎙 Start speaking";
    micButton.classList.remove("recording");

    if ($("callState").textContent === "Listening") {
      setCallState("Ready", "Tap the microphone and speak.", false);
    }
  };
} else {
  micButton.disabled = true;
  setCallState(
    "Speech recognition unavailable",
    "This browser does not expose browser speech recognition. Texting mode still works.",
    false
  );
}

async function translateVoice(text) {
  setCallState("Translating", "Translating your speech…", false);
  $("voiceTranslation").textContent = "…";

  try {
    const result = await translateText(text);
    $("voiceTranslation").textContent = result.text;

    const engineText =
      result.engine === "google"
        ? "Google translation complete."
        : "Demo translation complete.";

    setCallState("Translated", engineText + " Ready for the next phrase.", false);

    if ($("autoSpeak").checked) {
      speak(result.text);
    }
  } catch (error) {
    $("voiceTranslation").textContent = error.message;
    setCallState("Translation error", error.message, false);
  }
}

micButton.addEventListener("click", () => {
  if (!recognition) {
    toast("Speech recognition is not supported in this browser.");
    return;
  }

  if (listening) {
    recognition.stop();
    return;
  }

  recognition.lang =
    sourceLang.value === "auto" ? "en-US" : selectedLocale(sourceLang);

  try {
    recognition.start();
  } catch (error) {
    toast(error.message);
  }
});
