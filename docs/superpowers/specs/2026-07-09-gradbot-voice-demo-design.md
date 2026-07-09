# Gradbot Generic Voice Chat Demo — Design

**Date**: 2026-07-09

## Overview

A minimal, self-contained demo showing `pip install gradbot` working end-to-end: talk into a browser mic, get a spoken reply back from an LLM, with a live transcript. No specific persona or GTM use case — just a generic "ask me anything" voice assistant to prove the stack works.

## Goals

- Prove `gradbot` (Gradium's open-source voice-agent framework) works on this machine via a plain `pip`/`uv` install of the published package — no cloning the gradbot repo, no Rust toolchain, no `maturin` build.
- Real-time, dynamic, open-ended conversation (any topic).
- Reuse gradbot's own reference demo (`simple_chat`) as the template, since it's already a complete, working ~30-line example.

## Non-goals

- No custom persona, tool calling, or business logic.
- No production hardening (auth, rate limiting, deployment).
- Not modifying gradbot itself — pure consumer of the published package.

## Architecture

New self-contained folder `voice_demo/` in this repo, managed with `uv`:

```
voice_demo/
  pyproject.toml       # uv project, depends on published `gradbot` (PyPI)
  main.py               # FastAPI app + websocket route
  static/
    index.html          # adapted from gradbot's simple_chat frontend
    favicon.png
```

`gradbot` ships prebuilt wheels for Windows (win_amd64) for Python 3.12/3.13/3.14, so a normal `uv add gradbot` is sufficient — no source build required.

## Components

- **Backend (`main.py`)**: FastAPI app modeled directly on gradbot's `simple_chat` reference demo.
  - `gradbot.config.from_env()` reads `GRADIUM_API_KEY`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` from `.env`.
  - `@app.websocket("/ws/chat")` calls `gradbot.websocket.handle_session(websocket, config=cfg, on_start=make_config)`, where `make_config` returns a `gradbot.SessionConfig` with a generic system prompt (no persona), selected voice/language, and `assistant_speaks_first=True`.
  - `gradbot.routes.setup(app, config=cfg, static_dir=..., with_voices=True)` mounts the static frontend, gradbot's own bundled JS audio client (Opus encoding, playback, mic capture — shipped inside the `gradbot` pip package itself), and a `/api/voices` endpoint for the voice picker.
- **Frontend (`static/index.html`)**: Copied from gradbot's `simple_chat` demo, with the "2347 time traveller" persona copy/header replaced by generic "ask me anything" assistant copy. Keeps the existing mic "orb" button, voice-selection dropdown, echo-cancellation toggle, and live transcript panel — all free functionality from the template.

## Configuration

`.env` (already has `GRADIUM_API_KEY` and `OPENROUTER_API_KEY`) gets three additional lines to wire the LLM through OpenRouter:

```
LLM_API_KEY=<same value as OPENROUTER_API_KEY>
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=openai/gpt-oss-120b:free
```

`openai/gpt-oss-120b:free` was chosen for speed and zero cost, since voice-agent latency matters and OpenRouter still requires an API key even for free-tier models.

## Data Flow

1. Browser mic captures audio → Opus-encoded → streamed over `/ws/chat` WebSocket.
2. gradbot's Rust engine forwards audio to Gradium STT (streaming, semantic VAD).
3. Transcript is sent to the configured LLM (OpenRouter → `openai/gpt-oss-120b:free`).
4. LLM's reply text streams back through gradbot to Gradium TTS.
5. Synthesized audio streams back over the same WebSocket to the browser, which plays it and appends both sides of the turn to the transcript panel.

## Error Handling

No custom error handling is added. gradbot's Rust engine and its bundled JS client already handle mic-permission failures, WebSocket disconnects, and STT/TTS/LLM provider errors — our code surface is limited to configuration (env vars) and one system-prompt string, so there's nothing meaningful to add on top.

## Testing Plan

This is a live voice demo with no automated test surface. Verification is manual: start the server (`uv run uvicorn main:app --reload` from `voice_demo/`), open `http://localhost:8000`, grant mic access, talk, and confirm:
- The mic button shows a "listening" state.
- Speech is transcribed correctly in the transcript panel.
- The assistant replies both in transcript text and as audible speech.
- A follow-up turn works (multi-turn conversation).
