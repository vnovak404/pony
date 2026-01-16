# Speech Pipeline with Local BYOK Support

## Overview

Defines a real-time speech system for Stella with:
- Audio input -> OpenAI realtime speech-to-speech (S2S)
- Custom pronunciation/name handling
- Optional local helper service that runs on the user's machine, storing the user's OpenAI API key (BYOK)
- Website frontend communicates with the local service for secure API usage

Goal: <= 500 ms round-trip for short utterances.

## Architecture

### 1) Client Audio Capture

- Capture live audio via mic (WebRTC or Web Audio).
- Encode into small chunks (~100-200 ms) for low latency.
- Send to local helper service over localhost HTTP/WS.

### 2) Local Helper Service (installed on user machine)

Purpose:
- Runs locally and uses user-provided OpenAI API key (never exposed to web servers).
- Bridges browser audio to OpenAI realtime speech-to-speech sessions.
- Assembles session context and pronunciation rules.
- Website frontend talks to it via localhost HTTP + WebSocket.

API Key Management:
- User enters OpenAI key during install/config.
- Stored securely (OS keystore or local env variable).
- Local service reads key to make OpenAI API calls.
- Keys are not sent to remote servers or stored centrally.

Security:
- API key remains under user control and never travels externally.
- Local server validates requests only from known origins (localhost with CORS restrictions).
- Do not embed keys in web code or expose them to browser JavaScript directly.
- User responsible for securing their own environment (secrets in env/keystore, avoid public code storage).

### 3) Realtime Speech-to-Speech (S2S)

Service:
- Use `gpt-4o-realtime-preview` via the local helper.

Processing:
- Helper opens a realtime session and streams audio chunks.
- Session instructions include pronunciation rules and lore context.
- Audio responses stream back to the browser with optional text transcripts.
- Voice is selected per-pony (male voices: ballad, echo, onyx, ash; female voices: coral, fable, shimmer).
- Frontend selects the active pony and sends the pony slug to the helper at session start.
- If asked for a life story, the pony replies with a ~100 word summary and can call a tool to fetch the full story.

### 4) Pronunciation/Name Guide

Definition:
- Local table of tokens -> normalized forms (e.g., weird pony names).
- Applied after STT and before LLM.
- Stored locally with local helper service.

Example entries:
- Stella -> "Stel-la"
- Twylite -> "Twy-light"
- Pwnicorn -> "Pon-ee-corn"

### 5) Action Hooks

- Realtime session can emit action tool calls (pony actions like `eat`, `rest`, `repair`, `resupply`, `gather`).
- For `gather`, include an `ingredient` field (e.g., `lumber`, `water`, `honey`).
- Full life stories are available via `pony_backstory` tool calls when requested.
- Frontend listens for action messages and issues map commands.
- Pipeline mode supports the same `pony_action` / `pony_backstory` tool calls.

### 6) Protocol & Endpoints (local helper)

Endpoints:
- GET /health - service status.
- GET /pronunciation-guide - fetch local pronunciation rules.
- POST /pronunciation-guide - update pronunciation entries.
- POST /actions - append a recent action.
- WS / (realtime bridge) - audio/text streaming between browser and OpenAI realtime.

Communication:
- Frontend connects via HTTP/WS to localhost service.
- Only local origins allowed (secure CORS).
- No API key passed to frontend.
- For https sites, the helper must run on HTTPS/WSS with a trusted local cert.

### 7) Data Flow

Real-time turn:
1. Client audio chunk -> local WS bridge
2. Local helper streams audio into `gpt-4o-realtime-preview` session with lore + pronunciation context
3. Audio response streams back to the browser
4. Optional transcripts + action tool calls are sent alongside audio

### 8) Performance & Latency

- Small chunks to reduce perceived lag.
- Persistent connection to local helper to avoid handshake overhead.
- Local helper uses efficient HTTP/WS for low latency.

Latency targets:
- Realtime S2S: low chunking overhead with server VAD.
- Audio: early chunk flush for fast playback.

Total (short utterance): <= 500 ms target.

### 9) Pronunciation Guide Storage

- Stored locally alongside helper configuration.
- Fast lookup table for run-time normalization.
- Editable via local helper API.

### 10) Security & Key Handling

- API keys stored in OS-level secure storage or environment variables.
- Local service uses key only on local machine.
- Frontend has no access to actual API key.
- Avoid embedding keys in browser code or repos.
- Advise users on key rotation and secure storage per API key safety best practices.

### 11) Installation & Deployment

Installer options:
- Electron app.
- Native binary for major OSes.
- Package scripts (Homebrew, apt).

Install steps:
1. Ask user for OpenAI API key.
2. Validate and store securely locally.
3. Launch local helper service on fixed localhost port.
4. Register or install as background daemon/service.
5. Configure CORS to accept requests only from website origin.

### 12) Monitoring & Metrics

Track:
- Realtime session latency.
- Response start time.
- Save conversation transcripts under `logs/conversations/<pony-slug>-timestamp.txt`.
- Total round trip.
- Mispronunciation rates.

Alerts:
- High latency.
- Key misuse / rate limit errors.
- Local service failures.

### 13) Edge Cases & Failure Modes

- Local helper down -> prompt user to start/restart.
- API quota exceeded -> graceful fallback message.
- Pronunciation conflict -> fallback to normalized text.

### 14) Compliance Notes

- User API keys not shared or logged by external servers.
- Users bear responsibility for their own API usage and billing.
- Keys should not appear in client-side code or public repositories.

### 15) Future Enhancements

- Local cache of frequent responses to reduce API calls.
- Optional offline fallback models (local speech + LLM stack).
- GUI for managing pronunciation guide locally.

### 16) Success Criteria

- Consistent pronunciation of custom names.
- Secure BYOK handling with no server exposure of keys.
- End-to-end round trip for common utterances <= 500 ms.
- Reliable real-time frontend audio experience.
