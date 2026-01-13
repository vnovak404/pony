import { dispatchSpeechCommand } from "./actions.js";
import { SpeechClient } from "./client.js";

const resolveHelperHost = () => {
  const host = window.location.hostname;
  if (!host || host === "file") return "localhost";
  if (host === "127.0.0.1" || host === "localhost") return host;
  return "localhost";
};

const helperHost = resolveHelperHost();
const helperHttp = `http://${helperHost}:8091`;
const helperWs = `ws://${helperHost}:8092`;

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
};

const postAction = async () => {};

export const initSpeechUI = () => {
  const toggleButton = document.getElementById("speech-toggle");
  const clearButton = document.getElementById("speech-clear");
  const statusEl = document.getElementById("speech-status");
  const transcriptEl = document.getElementById("speech-transcript");
  const indicatorEl = document.getElementById("speech-pony-indicator");
  const indicatorTextEl = indicatorEl?.querySelector(
    ".speech-indicator-text"
  );
  const avatarImg = document.getElementById("speech-pony-avatar");
  const ponySelect = document.getElementById("speech-pony-select");
  const tokenInput = document.getElementById("speech-pronounce-token");
  const normalizedInput = document.getElementById("speech-pronounce-normalized");
  const saveButton = document.getElementById("speech-pronounce-save");
  const deleteButton = document.getElementById("speech-pronounce-delete");
  const guideStatus = document.getElementById("speech-guide-status");
  const pronounceToggle = document.getElementById("speech-pronounce-toggle");
  const pronounceBody = document.getElementById("speech-pronounce-body");
  const pronounceWrap = pronounceBody?.closest(".speech-pronunciation");

  if (!toggleButton || !statusEl || !transcriptEl) return;

  const client = new SpeechClient({ wsUrl: helperWs, httpBase: helperHttp });
  let isListening = false;
  let activePonySlug = "";
  const ponyNameBySlug = new Map();
  const transcriptLog = [];
  let pendingUser = "";
  let pendingPony = "";
  let awaitingUserFinal = false;
  let queuedPonyFinal = "";
  let queuedPonyTimer = null;
  let spaceActive = false;

  const renderTranscript = () => {
    const lines = transcriptLog.slice();
    if (pendingUser) {
      lines.push(`You: ${pendingUser}`);
    }
    if (pendingPony) {
      lines.push(`${getPonyLabel()}: ${pendingPony}`);
    }
    transcriptEl.textContent = lines.length ? lines.join("\n") : "…";
  };

  const appendLine = (line) => {
    if (!line) return;
    transcriptLog.push(line);
    renderTranscript();
  };

  const getPonyLabel = () =>
    ponyNameBySlug.get(activePonySlug) || activePonySlug || "Pony";

  const updateAvatar = (slug) => {
    if (!avatarImg) return;
    if (!slug) {
      avatarImg.removeAttribute("src");
      avatarImg.alt = "";
      return;
    }
    const basePath = `assets/ponies/${slug}`;
    avatarImg.dataset.fallback = "webp";
    avatarImg.alt = `${getPonyLabel()} portrait`;
    avatarImg.src = `${basePath}.webp`;
    avatarImg.onerror = () => {
      if (avatarImg.dataset.fallback === "png") return;
      avatarImg.dataset.fallback = "png";
      avatarImg.src = `${basePath}.png`;
    };
  };

  const clearQueuedPony = () => {
    if (queuedPonyTimer) {
      clearTimeout(queuedPonyTimer);
      queuedPonyTimer = null;
    }
    queuedPonyFinal = "";
  };

  const flushQueuedPony = () => {
    if (!queuedPonyFinal) return;
    appendLine(`${getPonyLabel()}: ${queuedPonyFinal}`);
    pendingPony = "";
    clearQueuedPony();
  };

  const queuePonyFinal = (text) => {
    queuedPonyFinal = text;
    pendingPony = text;
    renderTranscript();
    if (queuedPonyTimer) clearTimeout(queuedPonyTimer);
    queuedPonyTimer = setTimeout(() => {
      awaitingUserFinal = false;
      flushQueuedPony();
    }, 1500);
  };

  const setSpeaking = (active) => {
    if (!indicatorEl) return;
    indicatorEl.classList.toggle("is-speaking", Boolean(active));
    if (indicatorTextEl) {
      indicatorTextEl.textContent = active ? "Pony speaking" : "Pony quiet";
    }
  };

  const populatePonySelect = async () => {
    if (!ponySelect) return;
    try {
      const data = await requestJson("data/ponies.json");
      const ponies = Array.isArray(data?.ponies) ? data.ponies : [];
      ponySelect.innerHTML = "";
      ponyNameBySlug.clear();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Pick a pony";
      ponySelect.append(placeholder);
      ponies.forEach((pony) => {
        if (!pony || !pony.slug) return;
        const option = document.createElement("option");
        option.value = pony.slug;
        option.textContent = pony.name ? `${pony.name} (${pony.slug})` : pony.slug;
        ponySelect.append(option);
        ponyNameBySlug.set(pony.slug, pony.name || pony.slug);
      });
      const defaultSlug =
        ponies.find((pony) => pony.slug === "stellacorn")?.slug ||
        ponies[0]?.slug ||
        "";
      if (defaultSlug) {
        ponySelect.value = defaultSlug;
        activePonySlug = defaultSlug;
        updateAvatar(defaultSlug);
      }
    } catch (error) {
      if (ponySelect && !ponySelect.options.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Pony list unavailable";
        ponySelect.append(option);
      }
    }
  };

  client.setHandlers({
    onStatus: (status) => {
      if (!statusEl) return;
      const label = {
        connected: "Helper connected.",
        ready: "Helper ready.",
        listening: "Listening...",
        stopped: "Stopped.",
        disconnected: "Helper offline.",
        idle_timeout: "Helper idle timeout. Press Start.",
        session_timeout: "Session timeout. Press Start.",
      }[status];
      statusEl.textContent = label || status;
      if (status === "idle_timeout" || status === "session_timeout") {
        if (isListening) {
          client.stop({ close: true });
          isListening = false;
          updateToggleState();
        }
      }
    },
    onTranscript: (payload) => {
      if (!payload) return;
      const text = (payload.text || "").trim();
      const isFinal = Boolean(payload.final);
      if (isFinal) {
        pendingUser = "";
        awaitingUserFinal = false;
        if (text) appendLine(`You: ${text}`);
        else renderTranscript();
        flushQueuedPony();
        return;
      }
      pendingUser = text;
      awaitingUserFinal = true;
      renderTranscript();
    },
    onReply: (payload) => {
      if (!payload) return;
      if (payload.reset) {
        pendingPony = "";
        clearQueuedPony();
        renderTranscript();
        return;
      }
      const text = (payload.text || "").trim();
      const isFinal = Boolean(payload.final);
      if (isFinal) {
        pendingPony = "";
        if (text) {
          if (awaitingUserFinal) {
            queuePonyFinal(text);
          } else {
            appendLine(`${getPonyLabel()}: ${text}`);
          }
        } else {
          renderTranscript();
        }
        return;
      }
      pendingPony = text;
      renderTranscript();
    },
    onAudioActivity: (active) => {
      setSpeaking(active);
    },
    onAction: (action) => {
      dispatchSpeechCommand(action);
      postAction(action);
    },
    onError: (message) => {
      if (statusEl) statusEl.textContent = message;
    },
  });

  const updateToggleState = () => {
    toggleButton.textContent = isListening ? "Stop Listening" : "Start Listening";
  };

  const isEditableTarget = (target) => {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    if (!tag) return false;
    const upper = tag.toUpperCase();
    return upper === "INPUT" || upper === "TEXTAREA" || upper === "SELECT";
  };

  const startListening = async () => {
    if (isListening) return;
    try {
      const ponySlug = ponySelect?.value || activePonySlug || "";
      await client.start({ ponySlug });
      isListening = true;
      pendingUser = "";
      pendingPony = "";
      awaitingUserFinal = false;
      clearQueuedPony();
      renderTranscript();
    } catch (error) {
      if (statusEl) statusEl.textContent = "Microphone denied or helper offline.";
    }
    updateToggleState();
  };

  const stopListening = async () => {
    if (!isListening) return;
    await client.stop({ close: false });
    isListening = false;
    updateToggleState();
  };

  const checkHealth = async () => {
    try {
      const data = await requestJson(`${helperHttp}/health`);
      if (data && data.ok && statusEl && !isListening) {
        statusEl.textContent = "Helper ready.";
      }
    } catch (error) {
      if (statusEl && !isListening) {
        statusEl.textContent = "Helper offline.";
      }
    }
  };

  toggleButton.addEventListener("click", async () => {
    if (!isListening) {
      await startListening();
      return;
    }
    await stopListening();
  });

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      transcriptLog.length = 0;
      pendingUser = "";
      pendingPony = "";
      awaitingUserFinal = false;
      clearQueuedPony();
      renderTranscript();
    });
  }

  if (saveButton) {
    saveButton.addEventListener("click", async () => {
      const token = tokenInput?.value.trim();
      const normalized = normalizedInput?.value.trim();
      if (!token || !normalized) {
        if (guideStatus) guideStatus.textContent = "Enter both fields to save.";
        return;
      }
      try {
        await requestJson(`${helperHttp}/pronunciation-guide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: { [token]: normalized } }),
        });
        if (guideStatus) guideStatus.textContent = `Saved ${token}.`;
      } catch (error) {
        if (guideStatus) guideStatus.textContent = "Unable to save entry.";
      }
    });
  }

  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      const token = tokenInput?.value.trim();
      if (!token) {
        if (guideStatus) guideStatus.textContent = "Enter a token to delete.";
        return;
      }
      try {
        await requestJson(`${helperHttp}/pronunciation-guide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delete: [token] }),
        });
        if (guideStatus) guideStatus.textContent = `Deleted ${token}.`;
      } catch (error) {
        if (guideStatus) guideStatus.textContent = "Unable to delete entry.";
      }
    });
  }

  if (pronounceToggle && pronounceWrap) {
    const icon = pronounceToggle.querySelector(".speech-pronunciation-icon");
    const updatePronounceLabel = (collapsed) => {
      if (!icon) return;
      icon.textContent = collapsed ? "▸" : "▾";
    };
    pronounceToggle.addEventListener("click", () => {
      const isCollapsed = pronounceWrap.classList.toggle("is-collapsed");
      pronounceToggle.setAttribute("aria-expanded", String(!isCollapsed));
      updatePronounceLabel(isCollapsed);
    });
    pronounceToggle.setAttribute(
      "aria-expanded",
      String(!pronounceWrap.classList.contains("is-collapsed"))
    );
    updatePronounceLabel(pronounceWrap.classList.contains("is-collapsed"));
  }

  if (ponySelect) {
    ponySelect.addEventListener("change", () => {
      activePonySlug = ponySelect.value;
      updateAvatar(activePonySlug);
      if (isListening) {
        client.start({ ponySlug: activePonySlug });
      }
    });
  }

  const isSpaceKey = (event) =>
    event.code === "Space" || event.key === " " || event.key === "Spacebar";

  document.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (!isSpaceKey(event)) return;
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    spaceActive = true;
    startListening();
  });

  document.addEventListener("keyup", (event) => {
    if (!spaceActive) return;
    if (!isSpaceKey(event)) return;
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    spaceActive = false;
    stopListening();
  });

  updateToggleState();
  checkHealth();
  populatePonySelect();
  renderTranscript();
  setSpeaking(false);
};
