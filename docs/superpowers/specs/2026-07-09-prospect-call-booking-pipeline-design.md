# Prospect Call → Booking → Deck → Handoff Pipeline — Design

**Date**: 2026-07-09

## Overview

Extends the working `voice_demo/` Gradium+gradbot POC (see [`2026-07-09-gradbot-voice-demo-design.md`](2026-07-09-gradbot-voice-demo-design.md)) with the rest of the hackathon pipeline: given a single enriched prospect (produced upstream by a teammate's Sillage/FullEnrich/LLM pipeline), place a simulated outbound voice call, let the LLM voice bot pitch and try to book a BDR qualification call, and — only if that booking succeeds — generate a tailored Gamma deck and send two handoff emails (prospect + BDR).

This is a hackathon demo, not a production system: single hard-coded use case (book a BDR qualification call — no AE branching), one prospect at a time, minimal error handling, real external calls (Google Calendar, Gmail, Gamma) but no retries/queues.

## Goals

- Take one prospect JSON and drive a live, two-way voice conversation (human plays the prospect via mic) where a Claude/OpenRouter-backed LLM voice bot pitches them and tries to get agreement to a qualification call.
- Voice bot speaks English content through a French-accented voice (demo flavor).
- On the prospect agreeing to a time, create a **real** Google Calendar event (the BDR's calendar) with the prospect as attendee.
- On successful booking: generate a **real** tailored Gamma presentation (verified working against the live API) and, once ready, email the prospect a confirmation note containing the deck link.
- On successful booking (independent of deck timing): email the BDR a handoff/briefing note with the prospect's context so they're prepped for the call.
- If the prospect never agrees to book, nothing downstream fires.

## Non-goals

- No AE-vs-BDR branching logic — the only outcome is "book a BDR qualification call."
- No real telephony (Twilio, PSTN) — the call is simulated entirely in-browser (mic ↔ bot).
- No production hardening: no retry queues, no multi-prospect concurrency, no persistence beyond a single JSON file, no auth on the demo endpoints.
- Not building the upstream pipeline (BDR prompt → Sillage → LLM pick → FullEnrich → LLM pick → JSON) — that's a teammate's part. The JSON contract below is provisional and will be swapped for the real hand-off later.
- No calendar-availability lookup — the bot books whatever time the prospect proposes, without checking for conflicts.

## Architecture

Extends `voice_demo/` in place (same FastAPI app, same `/ws/chat` session flow) rather than a new service:

```
voice_demo/
  main.py               # wires prospect loading + personalized session + tool-call handler
  prospect.py           # loads prospect JSON, builds the SessionConfig (prompt, voice, tool)
  booking.py            # Google OAuth (Calendar + Gmail scopes) + create_event()
  deck.py                # Gamma generation: submit + poll, returns gammaUrl
  emailer.py             # Gmail send: prospect confirmation + BDR handoff
  data/
    prospect.json        # interim hand-off file (provisional contract, see below)
  .credentials/           # gitignored: OAuth client secret + cached refresh token
  static/
    index.html            # extended: prospect header + booking/deck status panel
```

### Provisional prospect JSON contract

Until the upstream pipeline is wired directly into this codebase, `prospect.py` loads from `data/prospect.json` with this shape:

```json
{
  "name": "Jane Doe",
  "company": "Acme Corp",
  "job_title": "VP of Operations",
  "context": "Free-text signal/pain point that triggered targeting",
  "email": "jane@acme.com",
  "phone": "+1-555-0100",
  "coordinates": {"lat": 48.8566, "lng": 2.3522}
}
```

`coordinates` is passthrough context only (e.g. mentioned for locale/timezone flavor in the prompt) — no logic depends on it. The loader is a single function (`prospect.load() -> Prospect`) so swapping the file read for a real POST endpoint later is a one-function change.

## Components

### `prospect.py` — session personalization
- `Prospect` pydantic model matching the JSON contract above.
- `build_system_prompt(p: Prospect) -> str`: bot persona = SDR calling on behalf of the company; states the prospect's name/company/job/context; objective = pitch briefly, handle objections, and get agreement to a short BDR qualification call; instructs the bot to use the `book_qualification_call` tool once a specific date/time is agreed.
- `pick_voice() -> str`: fetches Gradium's voice catalog (`gradbot.voices.load_catalog`), filters to `language == "fr"`, returns one `voice_id`.
- `build_session_config(p: Prospect) -> gradbot.SessionConfig`: `language=Lang.En` (content stays English), `voice_id=pick_voice()` (French accent), `instructions=build_system_prompt(p)`, `assistant_speaks_first=True` (outbound call), `tools=[BOOK_TOOL]`.
- `BOOK_TOOL = gradbot.ToolDef("book_qualification_call", ..., parameters_json=<schema with a required ISO-8601 `datetime` field>)`.

### `booking.py` — Google Calendar (real)
- One-time local OAuth (Desktop-app flow, `google-auth-oauthlib`) with scopes `https://www.googleapis.com/auth/calendar.events` and `https://www.googleapis.com/auth/gmail.send`. Refresh token cached to `.credentials/token.json` (gitignored) so later runs skip the consent screen.
- `create_booking(prospect: Prospect, when: datetime) -> BookingResult`: inserts an event on the BDR's (your) primary calendar, `attendees=[prospect.email]`, `sendUpdates="all"` (Calendar sends its own invite email — separate from the two emails below), title `"Qualification call — {name} ({company})"`, description = `prospect.context`. Returns the event's `htmlLink` and confirmed start time, or raises on failure.

### `deck.py` — Gamma generation (verified live against the real API)
- `generate_deck(prospect: Prospect) -> str` (returns `gammaUrl`):
  1. `POST https://public-api.gamma.app/v1.0/generations` with header `X-API-KEY`, body `{inputText: <built from job_title/company/context>, format: "presentation", numCards: 6, textMode: "generate", textOptions: {tone: "professional, consultative", audience: prospect.job_title}}` → `{generationId}`.
  2. Poll `GET /v1.0/generations/{id}` every 5s until `status == "completed"` (returns `gammaUrl`) or `"failed"`.
- Confirmed working end-to-end in a live test call during design: ~24s from submission to `completed`.

### `emailer.py` — Gmail API (two sends, both via the OAuth grant from `booking.py`)
- `send_prospect_email(prospect, booking, gamma_url)`: short note confirming the call + the `gammaUrl` link. Sent once the deck is ready.
- `send_bdr_email(prospect, booking)`: handoff/briefing note to the BDR — name, company, job title, context/signal, phone, email, and the confirmed call time. Sent immediately on successful booking, independent of deck timing.

### `main.py` — orchestration
- Loads the prospect via `prospect.load()` at startup, exposes it to the frontend (e.g. `GET /api/prospect`) so the UI can show who's being "called" before the session starts.
- `on_start`: returns `prospect.build_session_config(current_prospect)` instead of the generic prompt.
- `on_tool_call` (passed into `gradbot.websocket.handle_session`):
  1. If `handle.name == "book_qualification_call"`: parse `handle.args["datetime"]`, call `booking.create_booking(...)`.
     - Success: `await handle.send_json({"status": "booked", ...})` (so the LLM can confirm verbally), `await websocket.send_json({"type": "booking_confirmed", ...})` (so the UI updates live), fire-and-forget `asyncio.create_task(post_booking(prospect, booking_result, websocket))`.
     - Failure: `await handle.send_error(...)`; nothing downstream fires.
  2. `post_booking(...)`: `await emailer.send_bdr_email(...)` immediately; then `gamma_url = await deck.generate_deck(...)`; then `await emailer.send_prospect_email(..., gamma_url)`; push a `deck_ready` event over the websocket if it's still open (best-effort — the call may have already ended by the time the deck finishes).

### `static/index.html` — frontend additions
- On load, fetch `/api/prospect` and render a header ("Calling: Jane Doe, VP of Operations @ Acme Corp").
- New status panel beneath the transcript: shows "Booking confirmed — {time}" on `booking_confirmed`, then "Deck sent ✔" with a link on `deck_ready`.
- Everything else (orb button, mic capture, transcript, voice/language plumbing) is reused unchanged from the existing POC — the voice/language dropdown can stay for manual override during testing, but `prospect.build_session_config` already fixes the French voice + English language by default.

## Data Flow

1. Server starts, loads `data/prospect.json`.
2. Browser opens the page, fetches `/api/prospect`, shows the prospect header, user clicks the orb to start.
3. `/ws/chat` session starts with the prospect-personalized `SessionConfig` (French-accented voice, English content, `book_qualification_call` tool registered).
4. Live two-way conversation: human (mic) ↔ Gradium STT ↔ LLM ↔ Gradium TTS, exactly as in the existing POC.
5. If the prospect agrees to a time, the LLM calls `book_qualification_call` → `on_tool_call` creates the real Calendar event → LLM confirms verbally, UI shows "Booking confirmed."
6. In the background: BDR handoff email sends immediately; Gamma deck generation starts, polls to completion (~20-25s), then the prospect confirmation email sends with the deck link; UI shows "Deck sent ✔" if the session is still connected.
7. If the prospect never agrees, the call just ends after step 4 — no Calendar event, no emails, no deck.

## Error Handling

Kept intentionally minimal for a same-day hackathon build:
- Calendar booking failure (bad datetime, API error) → tool responds with an error to the LLM (it can apologize/retry in-conversation); no downstream emails/deck fire unless a later attempt succeeds.
- Gamma generation failure (`status: "failed"` or request error) → logged server-side, prospect email is **not** sent with a broken link; BDR email has already gone out regardless (it doesn't depend on the deck), so the handoff isn't blocked.
- Gmail send failure → logged; not retried.
- Websocket already closed by the time the deck/emails finish → the `deck_ready` push is best-effort and silently skipped; the emails still send since that part doesn't depend on the websocket.

## Testing Plan

Manual, live-demo verification (no automated test surface, consistent with the existing POC):
1. Populate `data/prospect.json` with a test contact (use a real email you control, so you can verify both emails end up in the right inbox).
2. Run the OAuth consent flow once locally to cache the Calendar+Gmail refresh token.
3. Start the server, open the page, confirm the prospect header renders.
4. Start the call, play the role of an interested prospect, agree to a specific date/time.
5. Confirm: LLM speaks English in a French-accented voice; a real event appears on the BDR's Google Calendar with the prospect as attendee; the UI shows "Booking confirmed."
6. Wait ~30s, confirm: the Gamma deck exists (`gammaUrl` opens a real presentation), the BDR handoff email arrived, and the prospect confirmation email arrived containing the deck link; UI shows "Deck sent ✔."
7. Run a second call where the prospect declines/never agrees — confirm no Calendar event, no emails, no deck are created.
