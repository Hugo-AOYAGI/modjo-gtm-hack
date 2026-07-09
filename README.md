# modjo-gtm-hack — autonomous prospecting agent

A GTM hackathon demo: a BDR types an ICP, and an AI agent researches matching
accounts, picks a champion, **calls them with a live AI voice**, books a real
meeting on the calendar, generates a tailored deck, and sends the follow-up
emails — end to end, hands-off.

Built around [Modjo](https://modjo.ai)'s use case (conversation intelligence
for sales teams) with a real **Dataiku** prospecting scenario.

---

## What it does

```
BDR types an ICP  →  Sillage (company signals)  →  pick account
                  →  FullEnrich (find the champion + contact info)
                  →  live AI voice call (Gradium + Claude)  →  books a meeting
                  →  Google Calendar event  +  Gamma deck  +  2 branded emails
```

The **sales monitor** (a Next.js app) drives and narrates the whole pipeline as
an agent timeline. When the agent "dials", a **prospect phone** page rings on a
real phone; the prospect answers and has a natural two-way voice conversation
with the AI rep (**Maud**), who pitches Modjo and books a qualification call.
The instant a time is agreed, the backend creates a **real Google Calendar
event**, then fires a **tailored Gamma deck** and **two branded Gmail emails**
(one to the prospect with the deck, one briefing the BDR).

Everything downstream of the voice call is real — real calendar writes, real
emails, a real generated deck.

---

## Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────────────┐
│  prospect-flow  (Next.js)   │        │  services  (FastAPI + gradbot)        │
│                             │        │                                        │
│  /          sales monitor   │◄──WS──►│  /ws/sales      broadcast of the call │
│  /prospect  prospect phone  │◄──WS──►│  /ws/phone      incoming-call ring    │
│                             │◄──WS──►│  /ws/prospect-call  live voice session│
│                             │──HTTP─►│  /api/dial /api/hangup                 │
└─────────────────────────────┘        │  /phone         standalone phone page │
                                        │                                        │
                                        │  booking.py  → Google Calendar         │
                                        │  deck.py     → Gamma API               │
                                        │  emailer.py  → Gmail API               │
                                        └──────────────────────────────────────┘
                                                    │ voice │
                                          Gradium STT/TTS  +  Claude (LLM)
```

The backend splits **pure logic** (unit-tested, no I/O) from **thin API
clients** (the only code that touches the network):

- `booking.py` / `deck.py` / `emailer.py` — pure functions; take an injected
  callable so they're testable without live credentials.
- `clients/` — `auth.py` (Google OAuth), `calendar_client.py`, `gmail_client.py`,
  `gamma_client.py` — the real network boundary.

---

## Repository layout

```
services/                 FastAPI backend (Python, uv)
  app.py                    all endpoints + the prospect-call orchestration
  models.py                 Prospect, BookingResult
  booking.py                pure: build_event_body, create_booking
  deck.py                   pure: Gamma submit + poll
  emailer.py                pure: branded prospect + BDR HTML emails
  clients/                  Google OAuth, Calendar, Gmail, Gamma adapters
  static/phone.html         standalone prospect phone (ring + mic, for ngrok)
  static/ring.wav           generated ringtone
  tests/                    unit tests for the pure logic
  POC_HANDOFF.md            build notes for each proven integration

prospect-flow/            Next.js sales-monitor + prospect-phone UI
  app/page.tsx              sales monitor (agent timeline)
  app/prospect/page.tsx     in-app prospect phone
  components/timeline/      the pipeline cards (sillage, fullenrich, call, deck…)
  lib/                      gradbot client, timeline state, Dataiku fixtures

claude-mock/              throwaway Claude-desktop UI mock (Vite + React)
claude-interface-mock.html  single-file version of the same mock

start.sh / stop.sh        run / stop the whole demo (backend + webapp)
tunnel.sh                 expose the phone over HTTPS via ngrok (for mobile)
```

---

## Prerequisites

- **[uv](https://docs.astral.sh/uv/)** (Python 3.12+) for the backend
- **Node 18+** for the Next.js app
- **[ngrok](https://ngrok.com/)** (free account) to put the prospect phone on a real phone
- API keys: **Gradium** (voice), **Anthropic** (LLM), **Gamma** (deck)
- A **Google account** with the Calendar + Gmail APIs enabled (for booking + emails)

---

## Setup

### 1. Backend env (`.env` at the repo root — gitignored)

```bash
GRADIUM_API_KEY=...          # Gradium voice (STT/TTS)
LLM_API_KEY=...              # LLM key (Anthropic key, or an OpenAI-compatible provider)
LLM_BASE_URL=https://api.anthropic.com/v1
LLM_MODEL=claude-haiku-4-5   # fast model for low voice latency
GAMMA_API_KEY=...            # Gamma deck generation
ANTHROPIC_API_KEY=...
# Optional — have sensible defaults in app.py:
# DECK_URL=...               # pre-made deck link used in the prospect email
# CALL_RECORDING_URL=...     # Modjo call link in the BDR briefing email
```

> The voice LLM is OpenAI-compatible via gradbot, so you can point `LLM_BASE_URL`
> / `LLM_MODEL` at any provider (e.g. Groq for the lowest latency).

### 2. Google OAuth (Calendar + Gmail)

1. In Google Cloud Console: create a project, enable the **Calendar API** and
   **Gmail API**, configure an OAuth consent screen (External / Testing), and add
   your Google account as a **test user**.
2. Create an **OAuth client ID → Desktop app**, download the JSON, and save it as
   `services/.credentials/client_secret.json`.
3. The first booking/email triggers a one-time browser consent; the refresh token
   is cached to `services/.credentials/token.json` (gitignored).

The recipients used in the demo are set at the top of `services/app.py`
(`BDR_EMAIL`, `PROSPECT_EMAIL`) — point them at inboxes you control.

### 3. Frontend env (`prospect-flow/.env.local` — gitignored)

```bash
NEXT_PUBLIC_GRADBOT_HTTP=http://localhost:8000
```

### 4. Install

```bash
cd services && uv sync && cd ..
cd prospect-flow && npm install && cd ..
```

---

## Running

### One command

```bash
./start.sh          # production build of the webapp — use this for demos
./start.sh --dev    # Next dev server (hot reload) — use this while iterating
./stop.sh           # stop backend + webapp
```

- **Sales monitor:** http://localhost:3000
- **Prospect phone:** http://localhost:8000/phone
- **Backend:** http://localhost:8000

### Put the prospect phone on a real phone

```bash
./tunnel.sh         # foreground — keep the terminal open during the demo
```

Open the printed `https://<ngrok-url>/phone` on the phone, **tap once to enable
sound** (browsers gate audio until a tap), then dial from the sales monitor.

### Manual (equivalent)

```bash
# backend
cd services && uv run uvicorn app:app --host 0.0.0.0 --port 8000
# webapp
cd prospect-flow && npm run dev        # or: npm run build && npm run start
```

---

## Running the demo

1. Open the **sales monitor** on the laptop and the **prospect phone** on a phone
   (via `./tunnel.sh`), tapping the phone once to arm audio.
2. In the monitor, submit an ICP (e.g. *"Enterprise AI platforms scaling their
   sales team"*). The agent web-searches, surfaces Dataiku's hiring signals, and
   picks a champion.
3. Hit **Dial** — the phone rings. Answer it.
4. Talk to **Maud** (the AI rep). Agree to a time ("Thursday at 10").
5. The monitor lights up: **meeting booked** → real Google Calendar event, then
   the **deck** card and **two email** cards as the follow-ups send.

---

## Tech stack

- **Voice:** [Gradium](https://docs.gradium.ai) STT/TTS via the `gradbot` engine
  (browser Opus audio ↔ WebSocket), **Claude** as the conversational LLM
- **Backend:** FastAPI, `uv`
- **Frontend:** Next.js + Tailwind + shadcn/ui
- **Integrations:** Google Calendar API, Gmail API (branded HTML emails),
  [Gamma](https://developers.gamma.app) deck generation

---

## Testing

```bash
cd services && uv run pytest tests/ -q
```

The pure-logic modules (booking, deck, emailer, gmail adapter) are unit-tested
with injected fakes — no live credentials required.

---

## Notes

- Everything downstream of the call is **real**: it writes to a real Google
  Calendar and sends real emails, so point `BDR_EMAIL` / `PROSPECT_EMAIL` at your
  own inboxes.
- The ngrok URL is public while the tunnel is open — the app can spend real API
  credits, so close the tunnel after the demo.
- On iPhone, the physical mute switch can silence web audio — flip the ringer on.
- Secrets (`.env`, `.env.local`, `services/.credentials/`) are gitignored and
  never committed.
```
