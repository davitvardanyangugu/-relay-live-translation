const $ = (id) => document.getElementById(id);

const sourceLang = $("sourceLang");
const targetLang = $("targetLang");
const messageInput = $("messageInput");
const messages = $("messages");
const apiState = $("apiState");

function decodeHtml(value) {
  const el = document.createElement("textarea");
  el.innerHTML = value;
  return el.value;
}

function selectedLocale(select) {
  return select.options[select.selectedIndex]?.dataset.locale || select.value;
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
    throw new Error(data.error || "Translation failed");
  }

  return {
    text: decodeHtml(data.translation),
    detectedSourceLanguage: data.detectedSourceLanguage
  };
}

async function checkApi() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();

    if (data.googleTranslateConfigured) {
      apiState.textContent = "● Google Translation ready";
    } else {
      apiState.textContent = "○ Add Google API key";
    }
  } catch {
    apiState.textContent = "○ Server offline";
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
}

async function sendText() {
  const text = messageInput.value.trim();
  if (!text) return;

  $("sendText").disabled = true;
  addBubble("source", "YOU", text);
  messageInput.value = "";

  try {
    const result = await googleTranslate(text);
    addBubble("translation", "GOOGLE TRANSLATION", result.text);
  } catch (error) {
    addBubble("translation", "ERROR", error.message);
  } finally {
    $("sendText").disabled = false;
  }
}

$("sendText").addEventListener("click", sendText);

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

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = selectedLocale(targetLang);
  speechSynthesis.speak(utterance);
}

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    listening = true;
    $("micButton").textContent = "■ Stop";
    $("micButton").classList.add("recording");
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
    $("micButton").textContent = "🎙 Start speaking";
    $("micButton").classList.remove("recording");

    if ($("callState").textContent === "Listening") {
      setCallState("Ready", "Tap the microphone and speak.", false);
    }
  };
} else {
  $("micButton").disabled = true;
  setCallState(
    "Speech recognition unavailable",
    "This browser does not expose speech recognition. Texting mode still works.",
    false
  );
}

async function translateVoice(text) {
  setCallState("Translating", "Sending transcript to Google Translation…", false);
  $("voiceTranslation").textContent = "…";

  try {
    const result = await googleTranslate(text);
    $("voiceTranslation").textContent = result.text;
    setCallState("Translated", "Ready for the next phrase.", false);

    if ($("autoSpeak").checked) {
      speak(result.text);
    }
  } catch (error) {
    $("voiceTranslation").textContent = error.message;
    setCallState("Translation error", error.message, false);
  }
}

$("micButton").addEventListener("click", () => {
  if (!recognition) return;

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
