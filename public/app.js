const $ = (id) => document.getElementById(id);

const sourceLang = $("sourceLang");
const targetLang = $("targetLang");
const sourceText = $("sourceText");
const translationOutput = $("translationOutput");
const readAloud = $("readAloud");
const settingsReadAloud = $("settingsReadAloud");
const conversationReadAloud = $("conversationReadAloud");

let roomId = null;
let socket = null;
let recognition = null;
let recognitionMode = null;
let listening = false;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function localeFor(select) {
  return select.options[select.selectedIndex]?.dataset.locale || select.value;
}

function plainLanguageName(select) {
  return (select.options[select.selectedIndex]?.textContent || select.value).replace(/^[A-Z]{2}\s/, "");
}

function randomRoomId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function inviteUrl(id) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", id);
  return url.toString();
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach(v => v.classList.remove("active"));

  $(viewName + "View").classList.add("active");
  const nav = document.querySelector('.nav-link[data-view="' + viewName + '"]');
  if (nav) nav.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (viewName === "conversation") ensureRoom();
}

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

sourceText.addEventListener("input", () => {
  $("charCount").textContent = sourceText.value.length + " / 1,200";
});

$("swap").addEventListener("click", () => {
  const from = sourceLang.value;
  sourceLang.value = targetLang.value;
  targetLang.value = from;

  const translated = translationOutput.classList.contains("has-text")
    ? translationOutput.textContent
    : "";

  if (translated) {
    const old = sourceText.value;
    sourceText.value = translated;
    translationOutput.textContent = old || "Your translation appears here";
    translationOutput.classList.toggle("has-text", Boolean(old));
    sourceText.dispatchEvent(new Event("input"));
  }

  toast(plainLanguageName(sourceLang) + " → " + plainLanguageName(targetLang));
});

async function translateText(text) {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      source: sourceLang.value,
      target: targetLang.value
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Translation failed.");

  const decoder = document.createElement("textarea");
  decoder.innerHTML = data.translation || "";

  return {
    text: decoder.value,
    engine: data.engine || "translation"
  };
}

function speakText(text, locale = localeFor(targetLang)) {
  if (!text || !("speechSynthesis" in window)) {
    if (!("speechSynthesis" in window)) toast("Text-to-speech is not supported in this browser.");
    return;
  }

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  speechSynthesis.speak(utterance);
}

async function runTranslator(text = sourceText.value.trim()) {
  if (!text) {
    toast("Type something or press Speak first.");
    return;
  }

  $("translateButton").disabled = true;
  $("translatorStatus").textContent = "Translating…";

  try {
    const result = await translateText(text);
    translationOutput.textContent = result.text;
    translationOutput.classList.add("has-text");
    $("translatorStatus").textContent =
      result.engine === "google" ? "Translated with Google" : "Translation ready";

    if (readAloud.checked) speakText(result.text);
  } catch (error) {
    $("translatorStatus").textContent = "Translation unavailable";
    toast(error.message);
  } finally {
    $("translateButton").disabled = false;
  }
}

$("translateButton").addEventListener("click", () => runTranslator());
$("listenTranslation").addEventListener("click", () => {
  if (!translationOutput.classList.contains("has-text")) {
    toast("Translate something first.");
    return;
  }
  speakText(translationOutput.textContent);
});

$("copyTranslation").addEventListener("click", async () => {
  if (!translationOutput.classList.contains("has-text")) {
    toast("Translate something first.");
    return;
  }
  await navigator.clipboard.writeText(translationOutput.textContent);
  toast("Translation copied.");
});

$("tryHello").addEventListener("click", () => {
  sourceText.value = "Hello! It is nice to meet you.";
  sourceText.dispatchEvent(new Event("input"));
  runTranslator(sourceText.value);
});

$("howRelayWorks").addEventListener("click", () => {
  $("howPanel").hidden = !$("howPanel").hidden;
});

function syncReadAloud(source) {
  const value = source.checked;
  readAloud.checked = value;
  settingsReadAloud.checked = value;
}
readAloud.addEventListener("change", () => syncReadAloud(readAloud));
settingsReadAloud.addEventListener("change", () => syncReadAloud(settingsReadAloud));

function setCallState(title, hint, live = false) {
  $("callStatus").textContent = title;
  $("callHint").textContent = hint;
  $("callDot").classList.toggle("live", live);
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    listening = true;
    if (recognitionMode === "translator") {
      $("speakButton").textContent = "Stop";
      $("translatorStatus").textContent = "Listening…";
    } else {
      $("callSpeakButton").textContent = "Stop";
      setCallState("Listening", "Speak naturally. Relay will translate when you pause.", true);
    }
  };

  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const part = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += part;
      else interimText += part;
    }

    const heard = finalText || interimText;

    if (recognitionMode === "translator") {
      sourceText.value = heard;
      sourceText.dispatchEvent(new Event("input"));
      if (finalText) runTranslator(finalText);
    } else {
      $("heardText").textContent = heard || "—";
      if (finalText) sendConversationText(finalText);
    }
  };

  recognition.onerror = (event) => {
    if (recognitionMode === "translator") {
      $("translatorStatus").textContent = "Microphone error";
    } else {
      setCallState("Microphone error", event.error, false);
    }
    toast("Microphone: " + event.error);
  };

  recognition.onend = () => {
    listening = false;
    $("speakButton").textContent = "Speak";
    $("callSpeakButton").textContent = "Start speaking";
    if (recognitionMode === "translator" && $("translatorStatus").textContent === "Listening…") {
      $("translatorStatus").textContent = "Ready when you are";
    }
    if (recognitionMode === "conversation" && $("callStatus").textContent === "Listening") {
      setCallState("Ready", "Tap Start speaking.", false);
    }
  };
}

function startRecognition(mode) {
  if (!recognition) {
    toast("Speech recognition is not available in this browser. You can still type.");
    return;
  }

  if (listening) {
    recognition.stop();
    return;
  }

  recognitionMode = mode;
  recognition.lang = localeFor(sourceLang);

  try {
    recognition.start();
  } catch (error) {
    toast(error.message);
  }
}

$("speakButton").addEventListener("click", () => startRecognition("translator"));
$("callSpeakButton").addEventListener("click", () => startRecognition("conversation"));

function ensureRoom(forceNew = false) {
  if (!roomId || forceNew) {
    const url = new URL(window.location.href);
    roomId = !forceNew ? url.searchParams.get("room") : null;
    if (!roomId) roomId = randomRoomId();
    history.replaceState({}, "", inviteUrl(roomId));
  }

  $("inviteLink").value = inviteUrl(roomId);
  connectRoom();
}

function connectRoom() {
  if (!roomId || socket?.connected) {
    if (socket?.connected) socket.emit("room:join", { roomId });
    return;
  }

  if (typeof io !== "function") {
    setCallState("Preview mode", "Deploy Relay to enable shared invitation rooms.", false);
    return;
  }

  socket = io({
    transports: ["websocket"]
  });

  socket.on("connect", () => {
    socket.emit("room:join", { roomId });
    setCallState("Connected", "Invite someone or start speaking.", false);
  });

  socket.on("room:notice", ({ text } = {}) => {
    if (text) toast(text);
  });

  socket.on("relay:message", (message) => {
    addRoomMessage(message, false);
    if (conversationReadAloud.checked && message.translation) {
      speakText(message.translation, localeFor(targetLang));
    }
  });

  socket.on("disconnect", () => {
    setCallState("Reconnecting…", "Trying to reconnect to the room.", false);
  });
}

function addRoomMessage(message, mine) {
  const empty = $("conversationMessages").querySelector(".conversation-empty");
  if (empty) empty.remove();

  const bubble = document.createElement("div");
  bubble.className = "room-message " + (mine ? "mine" : "theirs");

  const original = document.createElement("div");
  original.textContent = message.original;

  const translation = document.createElement("small");
  translation.textContent = message.translation || "";

  bubble.append(original, translation);
  $("conversationMessages").appendChild(bubble);
  $("conversationMessages").scrollTop = $("conversationMessages").scrollHeight;
}

async function sendConversationText(rawText = $("conversationInput").value.trim()) {
  const text = rawText.trim();
  if (!text) {
    toast("Type or speak a message first.");
    return;
  }

  $("sendConversation").disabled = true;
  setCallState("Translating", "Preparing your message…", false);

  try {
    const result = await translateText(text);
    const message = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      original: text,
      translation: result.text,
      source: sourceLang.value,
      target: targetLang.value,
      engine: result.engine
    };

    addRoomMessage(message, true);

    if ($("conversationInput").value.trim() === text) $("conversationInput").value = "";
    $("heardText").textContent = text;

    if (socket?.connected) {
      socket.emit("relay:message", message);
      setCallState("Sent", "The translated message was sent to the room.", false);
    } else {
      setCallState("Local preview", "Deploy Relay to sync this room with another device.", false);
    }

    if (readAloud.checked) speakText(result.text);
  } catch (error) {
    setCallState("Translation unavailable", error.message, false);
    toast(error.message);
  } finally {
    $("sendConversation").disabled = false;
  }
}

$("sendConversation").addEventListener("click", () => sendConversationText());
$("conversationInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendConversationText();
  }
});

$("startConversation").addEventListener("click", () => {
  ensureRoom(true);
  switchView("conversation");
});

$("copyInvite").addEventListener("click", async () => {
  ensureRoom();
  await navigator.clipboard.writeText($("inviteLink").value);
  toast("Invitation link copied.");
});

$("newRoom").addEventListener("click", () => {
  roomId = null;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  ensureRoom(true);
  toast("New conversation room created.");
});

async function checkHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const data = await response.json();

    $("engineStatus").textContent = data.googleTranslateConfigured
      ? "Google Cloud Translation is connected. A fallback is also available."
      : "Google Cloud is not configured yet. Relay will use its fallback translation service.";
  } catch {
    $("engineStatus").textContent =
      "The server is not running in this preview. Deploy Relay to enable live translation and invitation rooms.";
  }
}

const initialRoom = new URL(window.location.href).searchParams.get("room");
if (initialRoom) {
  roomId = initialRoom;
  switchView("conversation");
} else {
  checkHealth();
}
