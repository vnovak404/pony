export const downsampleBuffer = (buffer, inputRate, targetRate) => {
  if (inputRate === targetRate) return buffer;
  if (inputRate < targetRate) return buffer;
  const ratio = inputRate / targetRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offset = 0;
  for (let i = 0; i < newLength; i += 1) {
    const nextOffset = Math.round((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = offset; j < nextOffset && j < buffer.length; j += 1) {
      sum += buffer[j];
      count += 1;
    }
    result[i] = count ? sum / count : 0;
    offset = nextOffset;
  }
  return result;
};

export const floatTo16BitPCM = (buffer) => {
  const output = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, buffer[i]));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
};

export const resampleBuffer = (buffer, inputRate, outputRate) => {
  if (!buffer || inputRate === outputRate) return buffer;
  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i += 1) {
    const position = i * ratio;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(leftIndex + 1, buffer.length - 1);
    const frac = position - leftIndex;
    const left = buffer[leftIndex] || 0;
    const right = buffer[rightIndex] || 0;
    result[i] = left + (right - left) * frac;
  }
  return result;
};

export const encodePCM16 = (pcm16) => {
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const decodePCM16 = (base64) => {
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
};

export const concatInt16 = (chunks) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Int16Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
};

export const pcm16ToWav = (pcm16, sampleRate) => {
  const buffer = new ArrayBuffer(44 + pcm16.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcm16.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, pcm16.length * 2, true);
  let offset = 44;
  for (let i = 0; i < pcm16.length; i += 1) {
    view.setInt16(offset, pcm16[i], true);
    offset += 2;
  }
  return buffer;
};

export class PcmStreamPlayer {
  constructor(sampleRate = 24000, options = {}) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioContext({ sampleRate });
    this.sampleRate = sampleRate;
    this.outputSampleRate = this.context.sampleRate;
    this.nextTime = this.context.currentTime;
    this.sources = new Set();
    this.onPlaybackStart = options.onPlaybackStart || null;
    this.playbackTimer = null;
    this.hasPlaybackStarted = false;
  }

  enqueue(pcm16) {
    if (!pcm16 || !pcm16.length) return;
    let floats = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i += 1) {
      floats[i] = pcm16[i] / 0x8000;
    }
    if (this.outputSampleRate !== this.sampleRate) {
      floats = resampleBuffer(
        floats,
        this.sampleRate,
        this.outputSampleRate
      );
    }
    const buffer = this.context.createBuffer(
      1,
      floats.length,
      this.outputSampleRate
    );
    buffer.getChannelData(0).set(floats);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
    };
    if (this.nextTime < this.context.currentTime) {
      this.nextTime = this.context.currentTime + 0.02;
    }
    if (!this.hasPlaybackStarted && this.onPlaybackStart) {
      this.hasPlaybackStarted = true;
      const scheduledStart = this.nextTime;
      const delayMs = Math.max(
        0,
        (scheduledStart - this.context.currentTime) * 1000
      );
      if (this.playbackTimer) {
        clearTimeout(this.playbackTimer);
      }
      this.playbackTimer = setTimeout(() => {
        this.playbackTimer = null;
        this.onPlaybackStart({
          scheduledStart,
          delayMs,
        });
      }, delayMs);
    }
    source.start(this.nextTime);
    this.nextTime += buffer.duration;
  }

  reset() {
    this.sources.forEach((source) => {
      try {
        source.stop(0);
      } catch (error) {
        // ignore
      }
      try {
        source.disconnect();
      } catch (error) {
        // ignore
      }
    });
    this.sources.clear();
    this.nextTime = this.context.currentTime;
    this.hasPlaybackStarted = false;
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  async close() {
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
    if (this.context && this.context.state !== "closed") {
      await this.context.close();
    }
  }
}
