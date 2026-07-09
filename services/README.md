# services — prospect-flow backend

FastAPI backend for the `prospect-flow` Next.js app: runs the live Gradium voice
call, books the qualification call on Google Calendar, generates the Gamma deck,
and sends the two branded follow-up emails.

## Layout

```
app.py            FastAPI app + all endpoints the prospect-flow app calls
models.py         Prospect, BookingResult
booking.py        pure booking logic (build_event_body, create_booking)
deck.py           pure Gamma logic (build_input_text, generate_deck)
emailer.py        pure email logic (build/render/send prospect + BDR messages)
clients/          thin external-API adapters (the only real I/O boundary)
  auth.py           Google OAuth grant (Calendar + Gmail), token cached in .credentials/
  calendar_client.py
  gmail_client.py
  gamma_client.py
static/phone.html   standalone prospect phone (same-origin, for single-ngrok-tunnel demos)
tests/            unit tests for the pure logic modules
```

The logic modules never import the clients — clients are injected as callables,
so the logic stays unit-testable without live credentials.

## Run

```bash
uv sync                              # first time
uv run uvicorn app:app --port 8000   # the Next.js app connects to localhost:8000
```

`.env` (repo root) supplies `GRADIUM_API_KEY`, `LLM_*`, `GAMMA_API_KEY`, etc.
Google OAuth uses `.credentials/client_secret.json` + a cached `.credentials/token.json`.

## Test

```bash
uv run pytest tests/ -q
```

## Endpoints (all consumed by prospect-flow)

- `POST /api/dial` — load a prospect and ring the phone
- `POST /api/hangup` — force-end the live call
- `WS /ws/phone` — prospect phone ring channel
- `WS /ws/prospect-call` — the live voice session (prospect holds the mic)
- `WS /ws/sales` — read-only sales-monitor stream (transcript + milestones)
- `GET /phone` — standalone prospect phone page
- `GET /api/audio-config`, `GET /static/js/*` — gradbot's bundled audio client
