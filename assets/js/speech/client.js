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

const defaultConfig = {
  httpBase: `http://${resolveHelperHost()}:8091`,
  wsUrl: `ws://${resolveHelperHost()}:8092`,
  targetSampleRate: 24000,
  bufferSize: 4096,
};

export class SpeechClient {
  constructor(config = {}) {
    this.config = { ...defaultConfig, ...config };
    this.ws = null;
    this.stream = null;
    this.audioContext = null;
    this.processor = null;
    this.player = null;
    this.transcript = "";
    this.reply = "";
    this.closeAfterResponse = false;
    this.closeTimer = null;
    this.isClosing = false;
    this.audioActive = false;
    this.audioIdleTimer = null;
    this.isListening = false;
    this.sessionReady = false;
    this.readyPromise = null;
    this.readyResolve = null;
    this.debug = config.debug ?? true;
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

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.wsUrl);
      ws.addEventListener("open", () => {
        this.ws = ws;
        this._log("ws_open", { url: this.config.wsUrl });
        this._emitStatus("connected");
        resolve(ws);
      });
      ws.addEventListener("message", (event) => {
        this._handleMessage(event.data);
      });
      ws.addEventListener("error", () => {
        this._log("ws_error", {});
        this._emitError("WebSocket error.");
        reject(new Error("WebSocket error"));
      });
      ws.addEventListener("close", () => {
        this._log("ws_close", {});
        this._emitStatus("disconnected");
      });
    });
  }

  async start(options = {}) {
    await this.connect();
    if (this.isListening) {
      const ponySlug = options.ponySlug || "";
      this.sessionReady = false;
      this.readyPromise = new Promise((resolve) => {
        this.readyResolve = resolve;
      });
      this._sendJson({ type: "switch", ponySlug });
      return;
    }
    this.sessionReady = false;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    if (this.player) {
      await this.player.close();
      this.player = null;
    }
    this.player = new PcmStreamPlayer(this.config.targetSampleRate);
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
    });
    this._log("start_listening", { ponySlug });
    await this._awaitReady();
    await this._startMicCapture();
    this._emitStatus("listening");
    this.isListening = true;
  }

  async stop(options = {}) {
    const close = Boolean(options.close);
    this.closeAfterResponse = close;
    if (close) {
      if (this.closeTimer) clearTimeout(this.closeTimer);
      this.closeTimer = setTimeout(() => {
        this._maybeCloseAfterResponse(true);
      }, 30000);
    }
    await this._stopMicCapture();
    this._sendJson({ type: "stop" });
    this._log("stop_listening", { close });
    if (!close) {
      this._emitStatus("stopped");
    }
    this.isListening = false;
  }

  async close() {
    if (this.isClosing) return;
    this.isClosing = true;
    await this._stopMicCapture();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
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
    this._emitStatus("stopped");
    this.isClosing = false;
    this.isListening = false;
    this.sessionReady = false;
    this.readyPromise = null;
    this.readyResolve = null;
  }

  _sendAudio(pcm16) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.sessionReady) return;
    const payload = encodePCM16(pcm16);
    this.ws.send(JSON.stringify({ type: "audio", audio: payload }));
    this._log("audio_out", { bytes: pcm16.byteLength || pcm16.length || 0 });
  }

  _sendJson(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
    if (payload?.type) {
      this._log("ws_out", { type: payload.type });
    }
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
      return;
    }
    if (type === "audio") {
      const pcm16 = decodePCM16(payload.audio);
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
        this.handlers.onAction(payload.action || {});
      }
      return;
    }
    if (type === "status") {
      const status = payload.status || "connected";
      if (status === "ready") {
        this._markReady();
      }
      this._emitStatus(status);
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

  async _stopMicCapture() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
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

  async _awaitReady() {
    if (this.sessionReady) return;
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  _markReady() {
    if (this.sessionReady) return;
    this.sessionReady = true;
    if (this.readyResolve) {
      this.readyResolve();
      this.readyResolve = null;
    }
  }

  async _startMicCapture() {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    this.stream = mediaStream;
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
      if (!this.sessionReady) return;
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
    this.processor = processor;
  }
}
