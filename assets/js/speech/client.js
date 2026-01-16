import {
  PcmStreamPlayer,
  decodePCM16,
  downsampleBuffer,
  encodePCM16,
  floatTo16BitPCM,
} from "./audio.js";

const resolveHelperHost = () => {
  const host = window.location.hostname;
  if (!host || host === "file") return "localhost";
  if (host === "127.0.0.1" || host === "localhost") return host;
  return "localhost";
};

const resolveHelperScheme = () => {
  if (window.location.protocol === "https:") {
    return { http: "https", ws: "wss" };
  }
  return { http: "http", ws: "ws" };
};

const { http: helperHttpScheme, ws: helperWsScheme } = resolveHelperScheme();

const defaultConfig = {
  httpBase: `${helperHttpScheme}://${resolveHelperHost()}:8091`,
  wsUrl: `${helperWsScheme}://${resolveHelperHost()}:8092`,
  targetSampleRate: 24000,
  bufferSize: 4096,
};
const READY_TIMEOUT_MS = 8000;

export class SpeechClient {
  constructor(config = {}) {
    this.config = { ...defaultConfig, ...config };
    this.ws = null;
    this.stream = null;
    this.audioContext = null;
    this.processor = null;
    this.source = null;
    this.player = null;
    this.transcript = "";
    this.reply = "";
    this.closeAfterResponse = false;
    this.closeTimer = null;
    this.isClosing = false;
    this.audioActive = false;
    this.audioIdleTimer = null;
    this.isListening = false;
    this.liveSessionActive = false;
    this.speechMode = config.speechMode || "pipeline";
    this.connected = false;
    this.sessionReady = false;
    this.sessionStarting = false;
    this.readyPromise = null;
    this.readyResolve = null;
    this.debug = config.debug ?? true;
    this.telemetry = config.telemetry ?? true;
    this.captureLogged = false;
    this.audioFirstByteLogged = false;
    this.audioPlayLogged = false;
    this.handlers = {
      onStatus: null,
      onTranscript: null,
      onReply: null,
      onError: null,
      onAction: null,
      onAudioActivity: null,
    };
  }

  setHandlers(handlers = {}) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  async setMode(mode) {
    if (mode !== "pipeline" && mode !== "realtime") return;
    this.speechMode = mode;
  }

  isLiveReady() {
    return Boolean(this.connected && this.sessionReady && this.liveSessionActive);
  }

  async startConvo(options = {}) {
    const ponySlug = options.ponySlug || "";
    if (this.sessionStarting || this.liveSessionActive) return;
    await this.connect();
    this.sessionReady = false;
    this.sessionStarting = true;
    this._createReadyPromise();
    if (this.player) {
      await this.player.close();
      this.player = null;
    }
    this._resetTurnTelemetry();
    this.player = new PcmStreamPlayer(this.config.targetSampleRate, {
      onPlaybackStart: (info) => {
        if (this.audioPlayLogged) return;
        this.audioPlayLogged = true;
        this._log("audio_play_start", info);
        this._sendTelemetry("audio_play_start", info);
      },
    });
    this._log("audio_context", {
      sourceRate: this.player.sampleRate,
      outputRate: this.player.outputSampleRate,
    });
    await this.player.context.resume();
    this.transcript = "";
    this.reply = "";
    this.closeAfterResponse = false;
    this.isClosing = false;
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this._sendJson({
      type: "start_convo",
      sampleRate: this.config.targetSampleRate,
      ponySlug,
    });
    this._log("start_convo", { ponySlug });
    const ready = await this._awaitReady(READY_TIMEOUT_MS);
    if (!ready) {
      this.sessionStarting = false;
      this._resolveReady(false);
      throw new Error("Live session timed out.");
    }
  }

  async hangup() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this._sendJson({ type: "hangup" });
    }
    await this._handleLiveClosed("hangup");
  }

  async openLiveSession(options = {}) {
    await this.startConvo(options);
  }

  async closeLiveSession() {
    await this.hangup();
  }

  async startCapture(options = {}) {
    if (this.speechMode === "realtime") return;
    await this.start(options);
  }

  async stopCapture(options = {}) {
    if (this.speechMode === "realtime" || !this.isListening) return;
    await this.stop(options);
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.wsUrl);
      let settled = false;
      const settle = (handler, value) => {
        if (settled) return;
        settled = true;
        handler(value);
      };
      ws.addEventListener("open", () => {
        this.ws = ws;
        this.connected = true;
        this._log("ws_open", { url: this.config.wsUrl });
        this._emitStatus("helper_connected");
        settle(resolve, ws);
      });
      ws.addEventListener("message", (event) => {
        this._handleMessage(event.data);
      });
      ws.addEventListener("error", () => {
        this._log("ws_error", {});
        this._emitError("WebSocket error.");
        this._handleDisconnect("error");
        settle(reject, new Error("WebSocket error"));
      });
      ws.addEventListener("close", () => {
        this._log("ws_close", {});
        this._handleDisconnect("close");
        settle(reject, new Error("WebSocket closed"));
      });
    });
  }

  async start(options = {}) {
    await this.connect();
    if (this.isListening) {
      const ponySlug = options.ponySlug || "";
    this.sessionReady = false;
    this.sessionStarting = false;
    this._createReadyPromise();
    this._sendJson({ type: "switch", ponySlug });
    return;
  }
  this.sessionReady = false;
  this._createReadyPromise();
    if (this.player) {
      await this.player.close();
      this.player = null;
    }
    this._resetTurnTelemetry();
    this.player = new PcmStreamPlayer(this.config.targetSampleRate, {
      onPlaybackStart: (info) => {
        if (this.audioPlayLogged) return;
        this.audioPlayLogged = true;
        this._log("audio_play_start", info);
        this._sendTelemetry("audio_play_start", info);
      },
    });
    this._log("audio_context", {
      sourceRate: this.player.sampleRate,
      outputRate: this.player.outputSampleRate,
    });
    await this.player.context.resume();
    this.transcript = "";
    this.reply = "";
    this.closeAfterResponse = false;
    this.isClosing = false;
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    const ponySlug = options.ponySlug || "";
    this._sendJson({
      type: "start",
      sampleRate: this.config.targetSampleRate,
      ponySlug,
      speechMode: this.speechMode,
    });
    this.sessionStarting = true;
    this._log("start_listening", { ponySlug });
    const readyPromise = this._awaitReady();
    try {
      await this._startMicCapture();
    } catch (error) {
      this.sessionStarting = false;
      throw error;
    }
    await readyPromise;
    this._emitStatus("listening");
    this.isListening = true;
  }

  async stop(options = {}) {
    const close = Boolean(options.close);
    this.closeAfterResponse = close;
    this.sessionStarting = false;
    if (close) {
      if (this.closeTimer) clearTimeout(this.closeTimer);
      this.closeTimer = setTimeout(() => {
        this._maybeCloseAfterResponse(true);
      }, 30000);
    }
    await this._stopMicCapture();
    this._sendJson({ type: "stop" });
    this._sendTelemetry("utterance_stop", { reason: "stop" });
    this._log("stop_listening", { close });
    if (!close) {
      this._emitStatus("stopped");
    }
    this.isListening = false;
  }

  async close() {
    if (this.isClosing) return;
    this.isClosing = true;
    this.sessionStarting = false;
    await this._stopMicCapture();
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.ws) {
      this.ws.close();
    }
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (this.player) {
      await this.player.close();
      this.player = null;
    }
    this._setAudioActive(false);
    this._handleDisconnect("close");
    this._emitStatus("stopped");
    this.isClosing = false;
    this.isListening = false;
    this.sessionReady = false;
    this.sessionStarting = false;
    this._resolveReady(false);
  }

  _sendAudio(pcm16) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.sessionReady && !this.sessionStarting) return;
    if (!this.captureLogged) {
      this.captureLogged = true;
      this._sendTelemetry("capture_start", {
        bytes: pcm16.byteLength || pcm16.length || 0,
        targetRate: this.config.targetSampleRate,
      });
      this._log("capture_start", {
        bytes: pcm16.byteLength || pcm16.length || 0,
      });
    }
    const payload = encodePCM16(pcm16);
    this.ws.send(JSON.stringify({ type: "audio", audio: payload }));
    this._log("audio_out", { bytes: pcm16.byteLength || pcm16.length || 0 });
  }

  _sendJson(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(payload));
    if (payload?.type) {
      this._log("ws_out", { type: payload.type });
    }
    return true;
  }

  _handleMessage(raw) {
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      return;
    }
    const type = payload.type;
    this._log("ws_in", { type });
    if (type === "transcript") {
      if (payload.final) {
        this.transcript = payload.text || this.transcript;
      } else {
        this.transcript += payload.delta || "";
      }
      const final = Boolean(payload.final);
      const text = this.transcript;
      this._emitTranscript({ text, final });
      if (final) {
        this.transcript = "";
      }
      return;
    }
    if (type === "reply") {
      this.reply += payload.delta || payload.text || "";
      this._emitReply({ text: this.reply, final: false });
      return;
    }
    if (type === "reply_reset") {
      this.reply = "";
      this._emitReply({ text: "", final: false, reset: true });
      this.audioFirstByteLogged = false;
      this.audioPlayLogged = false;
      return;
    }
    if (type === "reply_done") {
      this._emitReply({ text: this.reply, final: true });
      this.reply = "";
      return;
    }
    if (type === "audio_reset") {
      if (this.player) {
        this.player.reset();
      }
      this._setAudioActive(false);
      this.audioFirstByteLogged = false;
      this.audioPlayLogged = false;
      return;
    }
    if (type === "audio") {
      const pcm16 = decodePCM16(payload.audio);
      if (!this.audioFirstByteLogged) {
        this.audioFirstByteLogged = true;
        this._sendTelemetry("tts_first_audio_byte", {
          bytes: pcm16.byteLength || pcm16.length || 0,
          sourceRate: this.config.targetSampleRate,
        });
        this._log("tts_first_audio_byte", {
          bytes: pcm16.byteLength || pcm16.length || 0,
        });
      }
      if (this.player) {
        this.player.enqueue(pcm16);
        this._log("audio_in", {
          samples: pcm16.length,
          nextTime: this.player.nextTime.toFixed(3),
          currentTime: this.player.context.currentTime.toFixed(3),
          sourceRate: this.player.sampleRate,
          outputRate: this.player.outputSampleRate,
        });
      }
      this._setAudioActive(true);
      return;
    }
    if (type === "audio_done") {
      this._scheduleAudioIdle();
      return;
    }
    if (type === "action") {
      if (this.handlers.onAction) {
        const action = payload.action ?? payload;
        this.handlers.onAction(action);
      }
      return;
    }
    if (type === "status") {
      const status = payload.status || "";
      if (status === "helper_connected") {
        this.connected = true;
        this._emitStatus(status);
        return;
      }
      if (status === "helper_offline") {
        this._handleDisconnect("helper_offline");
        return;
      }
      if (status === "live_ready") {
        void this._handleLiveReady();
        return;
      }
      if (status === "live_closed") {
        void this._handleLiveClosed("server");
        return;
      }
      if (status === "ready") {
        this._markReady();
      }
      this._emitStatus(status);
      return;
    }
    if (type === "ready") {
      this._markReady();
    }
    if (type === "error") {
      this._emitError(payload.error || "Speech helper error.");
    }
  }

  _emitStatus(status) {
    if (this.handlers.onStatus) {
      this.handlers.onStatus(status);
    }
  }

  _emitTranscript(payload) {
    if (this.handlers.onTranscript) {
      this.handlers.onTranscript(payload);
    }
  }

  _emitReply(payload) {
    if (this.handlers.onReply) {
      this.handlers.onReply(payload);
    }
  }

  _emitError(message) {
    if (this.handlers.onError) {
      this.handlers.onError(message);
    }
  }

  _emitAudioActivity(active) {
    if (this.handlers.onAudioActivity) {
      this.handlers.onAudioActivity(active);
    }
  }

  _setAudioActive(active) {
    if (this.audioIdleTimer) {
      clearTimeout(this.audioIdleTimer);
      this.audioIdleTimer = null;
    }
    if (this.audioActive === active) return;
    this.audioActive = active;
    this._emitAudioActivity(active);
  }

  _scheduleAudioIdle() {
    if (this.audioIdleTimer) {
      clearTimeout(this.audioIdleTimer);
      this.audioIdleTimer = null;
    }
    if (!this.player || !this.player.context) {
      this._setAudioActive(false);
      return;
    }
    const remaining = Math.max(
      0,
      this.player.nextTime - this.player.context.currentTime
    );
    if (!remaining) {
      this._setAudioActive(false);
      this._maybeCloseAfterResponse();
      return;
    }
    this.audioIdleTimer = setTimeout(() => {
      this._setAudioActive(false);
      this._maybeCloseAfterResponse();
    }, Math.ceil(remaining * 1000));
  }

  async _handleLiveReady() {
    if (this.sessionReady) return;
    this.sessionReady = true;
    this.sessionStarting = false;
    this.liveSessionActive = true;
    this._resolveReady(true);
    this._emitStatus("live_ready");
    if (this.speechMode !== "realtime") return;
    try {
      await this._startMicCapture();
      this.isListening = true;
      this._emitStatus("listening");
    } catch (error) {
      this._emitError("Microphone denied or helper offline.");
      await this.hangup();
    }
  }

  async _handleLiveClosed(reason) {
    if (!this.liveSessionActive && !this.sessionReady && !this.sessionStarting) {
      return;
    }
    this.sessionReady = false;
    this.sessionStarting = false;
    this.liveSessionActive = false;
    this._resolveReady(false);
    await this._stopMicCapture();
    this.isListening = false;
    if (this.player) {
      await this.player.close();
      this.player = null;
    }
    this._setAudioActive(false);
    this._emitStatus("live_closed");
    this._log("live_closed", { reason });
  }

  async _stopMicCapture() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }

  _maybeCloseAfterResponse(force = false) {
    if (!this.closeAfterResponse && !force) return;
    this.closeAfterResponse = false;
    this.close();
  }

  _log(event, data = {}) {
    if (!this.debug || typeof console === "undefined") return;
    const payload = { event, ...data, t: new Date().toISOString() };
    console.debug("[speech]", payload);
  }

  _sendTelemetry(event, data = {}) {
    if (!this.telemetry) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: "telemetry",
        event,
        data,
        clientTs: new Date().toISOString(),
      })
    );
  }

  _resetTurnTelemetry() {
    this.captureLogged = false;
    this.audioFirstByteLogged = false;
    this.audioPlayLogged = false;
  }

  async _awaitReady(timeoutMs = 0) {
    if (this.sessionReady) return true;
    if (this.readyPromise) {
      if (!timeoutMs) {
        return await this.readyPromise;
      }
      return await Promise.race([
        this.readyPromise,
        new Promise((resolve) => {
          setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
    }
    return false;
  }

  _markReady() {
    if (this.sessionReady) return;
    this.sessionReady = true;
    this.sessionStarting = false;
    this._resolveReady(true);
  }

  _createReadyPromise() {
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  _resolveReady(result) {
    if (this.readyResolve) {
      this.readyResolve(result);
      this.readyResolve = null;
    }
    this.readyPromise = null;
  }

  _handleDisconnect(reason) {
    const hadState =
      this.ws ||
      this.connected ||
      this.sessionReady ||
      this.sessionStarting ||
      this.liveSessionActive;
    this.connected = false;
    this.sessionReady = false;
    this.liveSessionActive = false;
    this.sessionStarting = false;
    this.isListening = false;
    this.ws = null;
    this._resolveReady(false);
    if (hadState) {
      this._emitStatus("helper_offline");
    }
    this._log("session_disconnect", { reason });
  }

  async _ensureMicStream() {
    if (this.stream) return this.stream;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return this.stream;
  }

  async _startMicCapture() {
    const mediaStream = await this._ensureMicStream();
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();
    await this.audioContext.resume();
    const source = this.audioContext.createMediaStreamSource(mediaStream);
    const processor = this.audioContext.createScriptProcessor(
      this.config.bufferSize,
      1,
      1
    );
    const sink = this.audioContext.createGain();
    sink.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (!this.sessionReady && !this.sessionStarting) return;
      const input = event.inputBuffer.getChannelData(0);
      const downsampled = downsampleBuffer(
        input,
        this.audioContext.sampleRate,
        this.config.targetSampleRate
      );
      const pcm16 = floatTo16BitPCM(downsampled);
      this._sendAudio(pcm16);
    };
    source.connect(processor);
    processor.connect(sink);
    sink.connect(this.audioContext.destination);
    this.source = source;
    this.processor = processor;
  }
}
