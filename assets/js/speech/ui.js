import { dispatchSpeechCommand } from "./actions.js";
import { SpeechClient } from "./client.js";

const resolveHelperHost = () => {
  const host = window.location.hostname;
  if (!host || host === "file") return "localhost";
  if (host === "127.0.0.1" || host === "localhost") return host;
  return "localhost";
};

const resolveHelperSchemeOverride = () => {
  const query = new URLSearchParams(window.location.search).get(
    "speech_helper_scheme"
  );
  const stored =
    typeof window.localStorage !== "undefined"
      ? window.localStorage.getItem("speechHelperScheme")
      : "";
  const override = (
    window.SPEECH_HELPER_SCHEME ||
    query ||
    stored ||
    ""
  )
    .toString()
    .trim()
    .toLowerCase();
  if (override === "https" || override === "wss") return "https";
  if (override === "http" || override === "ws") return "http";
  return "";
};

const resolveHelperScheme = () => {
  const override = resolveHelperSchemeOverride();
  if (override) {
    return { http: override, ws: override === "https" ? "wss" : "ws" };
  }
  if (window.location.protocol === "https:") {
    return { http: "https", ws: "wss" };
  }
  return { http: "http", ws: "ws" };
};

const probeHelper = async (url, timeoutMs = 500) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const detectHelperScheme = async (host) => {
  const resolved = resolveHelperScheme();
  if (resolved.http === "https") return resolved;
  const httpsHealth = `https://${host}:8091/health`;
  const response = await probeHelper(httpsHealth);
  if (response) {
    return { http: "https", ws: "wss" };
  }
  return resolved;
};

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
};

const postAction = async () => {};

export const initSpeechUI = async () => {
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
  const controlsWrap = toggleButton?.closest(".speech-controls");

  if (!toggleButton || !statusEl || !transcriptEl) return;

  const helperHost = resolveHelperHost();
  const helperScheme = await detectHelperScheme(helperHost);
  const helperHttp = `${helperScheme.http}://${helperHost}:8091`;
  const helperWs = `${helperScheme.ws}://${helperHost}:8092`;
  const client = new SpeechClient({ wsUrl: helperWs, httpBase: helperHttp });
  let isListening = false;
  let activePonySlug = "";
  const ponyNameBySlug = new Map();
  const transcriptItems = [];
  let currentUserId = null;
  let currentPonyId = null;
  let transcriptId = 0;
  let spaceActive = false;
  let holdActive = false;
  let holdReleaseQueued = false;
  let speechMode = "pipeline";
  let helperConnected = false;
  let liveReady = false;
  let liveOpening = false;
  let liveDeadlineTs = 0;
  let liveWarnTimer = null;
  let liveCloseTimer = null;
  let liveCountdownInterval = null;
  let liveCountdownRemaining = 0;

  const LIVE_MAX_MS = 3 * 60 * 1000;
  const LIVE_WARN_MS = 15 * 1000;

  const modeWrap = document.createElement("div");
  modeWrap.className = "speech-mode";
  modeWrap.innerHTML = `
    <label class="speech-mode-option">
      <input type="radio" name="speech-mode" value="pipeline" checked />
      Pipeline
    </label>
    <label class="speech-mode-option">
      <input type="radio" name="speech-mode" value="realtime" />
      Live (STS)
    </label>
  `;
  const startConvoButton = document.createElement("button");
  startConvoButton.type = "button";
  startConvoButton.className = "btn ghost";
  startConvoButton.id = "speech-live-start";
  startConvoButton.textContent = "Start Convo";
  const hangupButton = document.createElement("button");
  hangupButton.type = "button";
  hangupButton.className = "btn ghost";
  hangupButton.id = "speech-live-hangup";
  hangupButton.textContent = "Hang Up";
  const liveModal = document.createElement("div");
  liveModal.className = "speech-live-modal";
  liveModal.style.cssText =
    "display:none;position:fixed;inset:0;background:rgba(15,16,20,0.6);" +
    "align-items:center;justify-content:center;z-index:9999;";
  const liveModalBox = document.createElement("div");
  liveModalBox.style.cssText =
    "background:#fff;color:#111;padding:18px 20px;border-radius:10px;" +
    "box-shadow:0 12px 40px rgba(0,0,0,0.2);min-width:240px;max-width:320px;";
  const liveModalText = document.createElement("div");
  liveModalText.style.cssText = "font-weight:600;margin-bottom:12px;";
  const liveModalActions = document.createElement("div");
  liveModalActions.style.cssText = "display:flex;gap:10px;justify-content:flex-end;";
  const liveKeepButton = document.createElement("button");
  liveKeepButton.type = "button";
  liveKeepButton.className = "btn primary";
  liveKeepButton.textContent = "Keep Live On";
  const liveCloseButton = document.createElement("button");
  liveCloseButton.type = "button";
  liveCloseButton.className = "btn ghost";
  liveCloseButton.textContent = "Close Now";
  liveModalActions.append(liveCloseButton, liveKeepButton);
  liveModalBox.append(liveModalText, liveModalActions);
  liveModal.append(liveModalBox);
  document.body.append(liveModal);
  if (controlsWrap) {
    controlsWrap.insertBefore(modeWrap, toggleButton);
    if (clearButton && clearButton.parentNode === controlsWrap) {
      controlsWrap.insertBefore(hangupButton, clearButton);
      controlsWrap.insertBefore(startConvoButton, hangupButton);
    } else {
      controlsWrap.append(startConvoButton, hangupButton);
    }
  }

  const renderTranscript = () => {
    const ordered = transcriptItems
      .slice()
      .sort((a, b) => a.tsUtcMs - b.tsUtcMs);
    const lines = ordered.map((item) => {
      const label = item.role === "user" ? "You" : getPonyLabel();
      return `${label}: ${item.text}`;
    });
    transcriptEl.textContent = lines.length ? lines.join("\n") : "…";
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
    onStatus: async (status) => {
      if (!statusEl) return;
      const label = {
        helper_connected: "Helper connected.",
        helper_offline: "Helper offline.",
        live_ready: "Live on. Listening...",
        live_closed: "Live session closed.",
        connected: "Helper connected.",
        ready: "Helper ready.",
        listening: "Listening...",
        stopped: "Stopped.",
        disconnected: "Helper offline.",
        idle_timeout: "Helper idle timeout. Hold to Speak.",
        session_timeout: "Session timeout. Hold to Speak.",
      }[status];
      statusEl.textContent = label || status;
      if (
        status === "helper_connected" ||
        status === "connected" ||
        status === "ready"
      ) {
        helperConnected = true;
      }
      if (status === "live_ready") {
        liveReady = true;
        liveOpening = false;
        helperConnected = true;
        scheduleLiveAutoClose();
        updateToggleState();
        return;
      }
      if (status === "live_closed") {
        liveReady = false;
        liveOpening = false;
        clearLiveTimers();
        hideLiveModal();
        updateToggleState();
        return;
      }
      if (status === "helper_offline" || status === "disconnected") {
        helperConnected = false;
        if (speechMode === "realtime" && liveReady) {
          await hangupFromUI("disconnect");
        }
        updateToggleState();
        return;
      }
      if (status === "idle_timeout" || status === "session_timeout") {
        if (isListening) {
          client.stopCapture({ close: true });
          isListening = false;
          updateToggleState();
        }
      }
      updateToggleState();
    },
    onTranscript: (payload) => {
      if (!payload) return;
      const text = (payload.text || "").trim();
      const isFinal = Boolean(payload.final);
      if (!currentUserId) {
        if (text) {
          const id = `t${++transcriptId}`;
          transcriptItems.push({
            id,
            role: "user",
            tsUtcMs: Date.now(),
            text,
            final: isFinal,
          });
          currentUserId = isFinal ? null : id;
        }
      } else {
        const item = transcriptItems.find((entry) => entry.id === currentUserId);
        if (item) {
          if (text) item.text = text;
          if (isFinal) item.final = true;
        }
        if (isFinal) currentUserId = null;
      }
      renderTranscript();
    },
    onReply: (payload) => {
      if (!payload) return;
      if (payload.reset) {
        if (currentPonyId) {
          const item = transcriptItems.find((entry) => entry.id === currentPonyId);
          if (item) {
            if (item.text && !item.text.endsWith("...")) {
              item.text = `${item.text} ...`;
            }
            item.final = true;
          }
          currentPonyId = null;
        }
        renderTranscript();
        return;
      }
      const text = (payload.text || "").trim();
      const isFinal = Boolean(payload.final);
      if (!currentPonyId) {
        if (text) {
          const id = `t${++transcriptId}`;
          transcriptItems.push({
            id,
            role: "pony",
            tsUtcMs: Date.now(),
            text,
            final: isFinal,
          });
          currentPonyId = isFinal ? null : id;
        }
      } else {
        const item = transcriptItems.find((entry) => entry.id === currentPonyId);
        if (item) {
          if (text) item.text = text;
          if (isFinal) item.final = true;
        }
        if (isFinal) currentPonyId = null;
      }
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

  const getLiveReady = () =>
    liveReady ||
    (typeof client.isLiveReady === "function" ? client.isLiveReady() : false);

  const updateToggleState = () => {
    const liveReadyNow = getLiveReady();
    const label = isListening ? "Release to Stop" : "Hold to Speak";
    toggleButton.textContent = label;
    toggleButton.setAttribute("aria-pressed", String(isListening));
    if (speechMode === "realtime") {
      toggleButton.style.display = "none";
      startConvoButton.style.display = "";
      hangupButton.style.display = "";
      startConvoButton.disabled =
        !helperConnected || liveReadyNow || liveOpening;
      startConvoButton.textContent = liveOpening ? "Starting..." : "Start Convo";
      hangupButton.disabled = !liveReadyNow;
      if (statusEl && !isListening) {
        if (!helperConnected) {
          statusEl.textContent = "Helper offline.";
        } else if (liveReadyNow) {
          statusEl.textContent = "Live on. Listening...";
        } else if (liveOpening) {
          statusEl.textContent = "Starting live session...";
        } else {
          statusEl.textContent = "Ready for live session.";
        }
      }
    } else {
      toggleButton.style.display = "";
      toggleButton.disabled = false;
      startConvoButton.style.display = "none";
      hangupButton.style.display = "none";
      startConvoButton.disabled = true;
      hangupButton.disabled = true;
    }
  };

  const clearLiveTimers = () => {
    if (liveWarnTimer) {
      clearTimeout(liveWarnTimer);
      liveWarnTimer = null;
    }
    if (liveCloseTimer) {
      clearTimeout(liveCloseTimer);
      liveCloseTimer = null;
    }
    if (liveCountdownInterval) {
      clearInterval(liveCountdownInterval);
      liveCountdownInterval = null;
    }
    liveDeadlineTs = 0;
    liveCountdownRemaining = 0;
  };

  const hideLiveModal = () => {
    liveModal.style.display = "none";
    if (liveCountdownInterval) {
      clearInterval(liveCountdownInterval);
      liveCountdownInterval = null;
    }
  };

  const updateLiveModalText = () => {
    const remainingMs = Math.max(0, liveDeadlineTs - Date.now());
    liveCountdownRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
    liveModalText.textContent =
      "Closing live session in " + liveCountdownRemaining + " seconds";
  };

  const showLiveClosingModal = () => {
    if (!liveReady) return;
    updateLiveModalText();
    liveModal.style.display = "flex";
    if (liveCountdownInterval) clearInterval(liveCountdownInterval);
    liveCountdownInterval = setInterval(updateLiveModalText, 500);
  };

  const scheduleLiveAutoClose = () => {
    clearLiveTimers();
    liveDeadlineTs = Date.now() + LIVE_MAX_MS;
    liveWarnTimer = setTimeout(showLiveClosingModal, LIVE_MAX_MS - LIVE_WARN_MS);
    liveCloseTimer = setTimeout(async () => {
      await hangupFromUI("timeout");
    }, LIVE_MAX_MS);
  };

  const hangupFromUI = async (reason) => {
    clearLiveTimers();
    hideLiveModal();
    liveReady = false;
    liveOpening = false;
    await client.hangup();
    updateToggleState();
    if (statusEl && reason === "timeout") {
      statusEl.textContent = "Live session closed.";
    }
    if (statusEl && reason === "disconnect") {
      statusEl.textContent = "Helper offline.";
    }
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
    if (speechMode === "realtime") return;
    try {
      const ponySlug = ponySelect?.value || activePonySlug || "";
      await client.startCapture({ ponySlug, speechMode });
      isListening = true;
      currentUserId = null;
      currentPonyId = null;
      for (let i = transcriptItems.length - 1; i >= 0; i -= 1) {
        if (!transcriptItems[i].final) {
          transcriptItems.splice(i, 1);
        }
      }
      renderTranscript();
    } catch (error) {
      if (statusEl) statusEl.textContent = "Microphone denied or helper offline.";
    }
    updateToggleState();
  };

  const stopListening = async () => {
    if (!isListening) return;
    await client.stopCapture({ close: false });
    isListening = false;
    updateToggleState();
  };

  const startConvo = async () => {
    if (liveReady || liveOpening) return;
    liveOpening = true;
    updateToggleState();
    try {
      const ponySlug = ponySelect?.value || activePonySlug || "";
      await client.startConvo({ ponySlug });
      helperConnected = true;
    } catch (error) {
      helperConnected = false;
      if (statusEl) statusEl.textContent = "Helper offline.";
      liveReady = false;
    }
    liveOpening = false;
    updateToggleState();
  };

  const hangup = async () => {
    if (!liveReady) return;
    await hangupFromUI("user_off");
  };

  const checkHealth = async () => {
    try {
      const data = await requestJson(`${helperHttp}/health`);
      helperConnected = Boolean(data && data.ok);
      if (helperConnected && statusEl && !isListening) {
        statusEl.textContent = "Helper ready.";
      }
    } catch (error) {
      helperConnected = false;
      if (statusEl && !isListening) {
        statusEl.textContent = "Helper offline.";
      }
      if (speechMode === "realtime" && liveReady) {
        await hangupFromUI("disconnect");
      }
    }
    updateToggleState();
  };

  const beginHold = async (event) => {
    if (speechMode === "realtime") return;
    if (holdActive) return;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.pointerId != null && toggleButton.setPointerCapture) {
        toggleButton.setPointerCapture(event.pointerId);
      }
    }
    holdActive = true;
    holdReleaseQueued = false;
    await startListening();
    if (!isListening) {
      holdActive = false;
      return;
    }
    if (holdReleaseQueued) {
      holdReleaseQueued = false;
    }
  };

  const setSpeechMode = async (mode) => {
    if (mode !== "pipeline" && mode !== "realtime") return;
    if (speechMode === mode) return;
    speechMode = mode;
    await client.setMode(mode);
    if (speechMode === "realtime") {
      try {
        await client.connect();
        helperConnected = true;
      } catch (error) {
        helperConnected = false;
      }
    }
    if (speechMode !== "realtime" && (liveReady || liveOpening)) {
      await hangupFromUI("mode_switch");
    }
    updateToggleState();
  };

  const modeInputs = modeWrap.querySelectorAll("input[name='speech-mode']");
  modeInputs.forEach((input) => {
    input.addEventListener("change", (event) => {
      const value = event.target?.value;
      setSpeechMode(value);
    });
  });

  startConvoButton.addEventListener("click", async () => {
    await startConvo();
  });

  hangupButton.addEventListener("click", async () => {
    await hangup();
  });

  liveKeepButton.addEventListener("click", () => {
    hideLiveModal();
    scheduleLiveAutoClose();
  });

  liveCloseButton.addEventListener("click", async () => {
    await hangupFromUI("user_close");
  });

  const endHold = async (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.pointerId != null && toggleButton.releasePointerCapture) {
        toggleButton.releasePointerCapture(event.pointerId);
      }
    }
    if (!holdActive) return;
    if (!isListening) {
      holdReleaseQueued = true;
      return;
    }
    holdActive = false;
    holdReleaseQueued = false;
    await stopListening();
  };

  toggleButton.addEventListener("pointerdown", beginHold);
  toggleButton.addEventListener("pointerup", endHold);
  toggleButton.addEventListener("pointerleave", endHold);
  toggleButton.addEventListener("pointercancel", endHold);
  toggleButton.addEventListener("keydown", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    beginHold(event);
  });
  toggleButton.addEventListener("keyup", (event) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    endHold(event);
  });
  toggleButton.addEventListener("click", (event) => {
    event.preventDefault();
  });

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      transcriptItems.length = 0;
      currentUserId = null;
      currentPonyId = null;
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
    ponySelect.addEventListener("change", async () => {
      activePonySlug = ponySelect.value;
      updateAvatar(activePonySlug);
      if (speechMode === "realtime" && liveReady) {
        await hangupFromUI("pony_switch");
        await startConvo();
      } else if (isListening) {
        client.startCapture({ ponySlug: activePonySlug, speechMode });
      }
    });
  }

  const isSpaceKey = (event) =>
    event.code === "Space" || event.key === " " || event.key === "Spacebar";

  document.addEventListener("keydown", (event) => {
    if (speechMode !== "pipeline") return;
    if (!isSpaceKey(event)) return;
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    if (event.repeat) return;
    spaceActive = true;
    beginHold(event);
  });

  document.addEventListener("keyup", (event) => {
    if (speechMode !== "pipeline") return;
    if (!spaceActive) return;
    if (!isSpaceKey(event)) return;
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    spaceActive = false;
    endHold(event);
  });

  updateToggleState();
  client.setMode(speechMode);
  checkHealth();
  populatePonySelect();
  renderTranscript();
  setSpeaking(false);
};
