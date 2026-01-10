#!/usr/bin/env python3
import argparse
import os
import queue
import subprocess
import sys
import tempfile
import time
import wave

import numpy as np
import sounddevice as sd
from pynput import keyboard

def transcribe_faster_whisper(wav_path: str, model: str) -> str:
    from faster_whisper import WhisperModel
    wm = WhisperModel(model, device="auto", compute_type="int8")
    segments, _info = wm.transcribe(wav_path, vad_filter=True)
    return "".join(seg.text for seg in segments).strip()

def tmux_send(target_pane: str, text: str, press_enter: bool = True) -> None:
    if not text:
        return
    safe = " ".join(text.split())
    subprocess.check_call(["tmux", "send-keys", "-t", target_pane, safe])
    if press_enter:
        subprocess.check_call(["tmux", "send-keys", "-t", target_pane, "Enter"])

class Recorder:
    def __init__(self, sample_rate: int = 16000, channels: int = 1):
        self.sample_rate = sample_rate
        self.channels = channels
        self._q: "queue.Queue[np.ndarray]" = queue.Queue()
        self._stream = None
        self._frames: list[np.ndarray] = []
        self._recording = False

    def _callback(self, indata, frames, time_info, status):
        if self._recording:
            self._q.put(indata.copy())

    def start(self):
        if self._stream is None:
            self._stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                dtype="int16",
                callback=self._callback,
            )
            self._stream.start()
        while not self._q.empty():
            try:
                self._q.get_nowait()
            except queue.Empty:
                break
        self._frames = []
        self._recording = True

    def stop_to_wav(self) -> str:
        self._recording = False
        while True:
            try:
                self._frames.append(self._q.get_nowait())
            except queue.Empty:
                break
        if not self._frames:
            return ""
        audio = np.concatenate(self._frames, axis=0)
        fd, path = tempfile.mkstemp(prefix="dictate_", suffix=".wav")
        os.close(fd)
        with wave.open(path, "wb") as wf:
            wf.setnchannels(self.channels)
            wf.setsampwidth(2)  # int16
            wf.setframerate(self.sample_rate)
            wf.writeframes(audio.tobytes())
        return path

def main():
    ap = argparse.ArgumentParser(description="Push-to-talk dictation -> tmux send-keys")
    ap.add_argument("--target-pane", required=True, help="tmux pane id, e.g. %1")
    ap.add_argument("--hotkey", default="f8", help="toggle hotkey: f1..f12 (default: f8)")
    ap.add_argument("--model", default="small", help="faster-whisper model (default: small)")
    ap.add_argument("--no-enter", action="store_true", help="do not press Enter after sending text")
    ap.add_argument("--sample-rate", type=int, default=16000)
    args = ap.parse_args()

    target = args.target_pane
    press_enter = not args.no_enter

    rec = Recorder(sample_rate=args.sample_rate, channels=1)

    state = {"recording": False, "last_toggle": 0.0}

    hk = args.hotkey.lower().strip()
    keymap = {f"f{i}": getattr(keyboard.Key, f"f{i}") for i in range(1, 13)}
    if hk not in keymap:
        print(f"ERROR: unsupported hotkey '{args.hotkey}'. Use f1..f12.", file=sys.stderr)
        sys.exit(2)
    toggle_key = keymap[hk]

    def on_press(key):
        now = time.time()
        if now - state["last_toggle"] < 0.25:
            return
        if key == toggle_key:
            state["last_toggle"] = now
            if not state["recording"]:
                state["recording"] = True
                print(f"[dictate] REC ● (press {hk.upper()} to stop)", flush=True)
                rec.start()
            else:
                state["recording"] = False
                wav_path = rec.stop_to_wav()
                if not wav_path:
                    print("[dictate] (no audio captured)", flush=True)
                    return
                print("[dictate] transcribing…", flush=True)
                try:
                    text = transcribe_faster_whisper(wav_path, args.model)
                finally:
                    try: os.remove(wav_path)
                    except OSError: pass
                if not text:
                    print("[dictate] (no text)", flush=True)
                    return
                print(f"[dictate] → {text}", flush=True)
                tmux_send(target, text, press_enter=press_enter)
                print(f"[dictate] sent to {target}", flush=True)

    print(f"[dictate] ready. hotkey={hk.upper()} target-pane={target} model={args.model}", flush=True)
    print("[dictate] NOTE: macOS may require Accessibility permission for iTerm/Terminal.", flush=True)

    with keyboard.Listener(on_press=on_press) as listener:
        listener.join()

if __name__ == "__main__":
    main()
