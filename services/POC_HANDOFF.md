# POC Handoff — Booking → Deck → Email Pipeline

Six proof-of-concepts were built and verified live today, on top of the existing
`services/` Gradium+gradbot POC. Everything below is real and tested — not
mocked — except where explicitly noted. This doc is a tutorial for wiring them
into one live flow: the voice bot books a real meeting, then a real deck and
two real emails go out.

Full test suite (all pure logic, no live API calls): `uv run pytest tests/ -v`
→ 20/20 passing.

## What's proven vs. what's left

| Piece | Status |
|---|---|
| Live voice call (STT/LLM/TTS + tool-calling) | ✅ proven (existing POC) |
| French-accented voice speaking English content | ⚠️ architecturally confirmed, not yet run live |
| Real Google Calendar booking | ✅ proven live |
| Real Gamma deck generation | ✅ proven live |
| Real Gmail send (HTML, branded) | ✅ proven live |
| Two-page live broadcast (prospect + sales monitor) | ✅ proven live |
| ngrok tunnel for phone-mic testing | ✅ proven live |
| **The actual chain**: LLM tool-call → booking → emails → deck, triggered from a real conversation | ❌ **not yet wired** — each piece was tested by calling its Python functions directly, never end-to-end from a live `on_tool_call` |

The last row is the main remaining risk — see "Wiring the full flow" at the bottom.

---

## POC 1 — Real Google Calendar booking

**Proves**: a live voice bot can create a real calendar event with the prospect as an attendee.

**Files**: `models.py` (`Prospect`, `BookingResult`), `booking.py`, `calendar_client.py`, `auth.py`.

**Design**: `booking.py` has no I/O — `build_event_body(prospect, when)` is a pure
function returning a Calendar API event dict; `create_booking(insert_event, prospect, when)`
takes an *injected* `insert_event: Callable[[dict], dict]` and returns a `BookingResult`.
`calendar_client.py` is the only place that touches the real API:
`insert_event_via_api(service)` returns that callable, calling
`service.events().insert(calendarId="primary", body=body, sendUpdates="all").execute()`.

This split matters for the next agent: **never call the Google API directly from
business logic** — always go through the injected-callable pattern so it stays
testable without live credentials.

**Setup** (one-time, already done in this repo, but needed on a fresh machine):
1. Google Cloud Console → new project → enable **Calendar API** and **Gmail API** (Library tab). Both, even though this POC only needs Calendar — Gmail is needed by POC 3.
2. OAuth consent screen → External → Testing mode → add your Google account under **Test users**.
3. Credentials → Create OAuth client ID → Desktop app → download JSON → save as `services/.credentials/client_secret.json` (gitignored).
4. First real call to `auth.get_credentials()` opens a browser consent screen and caches a refresh token to `.credentials/token.json`. Subsequent calls are silent.

**Gotchas hit** (don't repeat these):
- A Google Workspace account (`@modjo.ai` here) can be **blocked by org admin policy** from unverified OAuth apps ("Access blocked: Your institution's admin needs to review..."). Fix: use a personal Google account for the OAuth grant instead.
- Even a personal account needs to be explicitly added as a **Test user** on the OAuth consent screen, or you get `Error 403: access_denied`.
- Enabling an API in the Cloud Console can 403 with `accessNotConfigured` for a minute or two after clicking Enable — just retry.
- **Calendar API and Gmail API are separate toggles** — enabling one does not enable the other.

**Live usage** (what was actually run):
```python
import datetime, auth, calendar_client, booking
from models import Prospect

prospect = Prospect(name="Jane Doe", company="Northbeam Logistics",
                     job_title="VP of Operations", context="...",
                     email="jane@example.com", phone="+1-555-0100")
when = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)

creds = auth.get_credentials()
service = calendar_client.build_service(creds)
result = booking.create_booking(calendar_client.insert_event_via_api(service), prospect, when)
# result.event_link, result.start_time
```
This created a real event with `sendUpdates="all"`, so Calendar itself emails the
prospect an invite — separate from the confirmation emails in POC 3.

---

## POC 2 — Real Gamma deck generation

**Proves**: a tailored presentation can be generated live from prospect context and a real URL retrieved.

**Files**: `deck.py` (pure polling logic), `gamma_client.py` (real HTTP).

**API contract** (verified live, not from docs alone):
- `POST https://public-api.gamma.app/v1.0/generations`, header `X-API-KEY`, body `{inputText, format: "presentation", numCards, textMode: "generate", textOptions: {tone, audience}}` → `{generationId}`.
- Poll `GET /v1.0/generations/{id}` → `{status: "pending"|"completed"|"failed", gammaUrl}`.
- Took **~20-25 seconds** end to end in testing — plan for that latency (see "Wiring" below on why this should run as a background task, not block the call).

**Design**: same injected-callable split as booking. `deck.generate_deck(prospect, submit, poll, sleep)`
is pure and tested with fakes; `gamma_client.submit_via_api(api_key)` / `poll_via_api(api_key)`
are the real, untested HTTP boundary.

**Live usage**:
```python
import os, time, deck, gamma_client
from models import Prospect
gamma_url = deck.generate_deck(
    prospect,
    submit=gamma_client.submit_via_api(os.environ["GAMMA_API_KEY"]),
    poll=gamma_client.poll_via_api(os.environ["GAMMA_API_KEY"]),
    sleep=time.sleep,
)
```
**Gotcha**: none hit — this one worked first try. `GAMMA_API_KEY` just needs to exist in `.env`.

---

## POC 3 — Real Gmail send, HTML branded emails

**Proves**: two distinct, branded HTML emails can be sent live — one to the prospect (booking summary + deck link), one to the BDR (prospect briefing + call-recording link + calendar link).

**Files**: `emailer.py` (pure message-building + HTML templates), `gmail_client.py` (real send).

**Design**: `build_prospect_message(prospect, booking, gamma_url)` and
`build_bdr_message(prospect, booking, bdr_email, call_platform_url="#")` return a stdlib
`EmailMessage` with both a plain-text part (`set_content`) and an HTML part
(`add_alternative(html, subtype="html")`) — standard `multipart/alternative`, so
clients that can't render HTML still get readable text. `send_prospect_email`/`send_bdr_email`
take an injected `send_raw: Callable[[str], None]` (a base64url-encoded raw RFC822 message)
so they're testable without hitting Gmail. `gmail_client.send_raw_via_gmail(service)` is the
one line that actually calls `service.users().messages().send(userId="me", body={"raw": raw}).execute()`.

**Testing HTML content**: once a message has an HTML alternative, the top-level
`msg.get_content()` raises (`multipart` isn't directly readable) — use
`msg.get_body(preferencelist=("html",)).get_content()` / `("plain",)` instead. See `tests/test_emailer.py`.

**Branding gotchas** (both hit and fixed — don't reintroduce):
- **Gmail strips inline `<svg>` tags** from HTML email bodies entirely. An inline SVG logo will silently not render. Don't use inline SVG in email HTML.
- A hand-drawn CSS recreation (divs/spans) works but looks off-brand. The fix that actually shipped: reference the **real hosted logo** via a normal `<img src="...">` pointing at Modjo's live asset (`emailer.LOGO_URL`, an SVG served from Modjo's Webflow CDN) — `<img src>` to an external SVG *does* render in Gmail, unlike inline `<svg>`. Check the real aspect ratio (`483×126` here) before setting `width`/`height` or it'll look squished.
- Gmail shows a one-time "images not displayed, click to display" prompt for any external image — that's normal Gmail behavior, not a bug.

**Live usage**:
```python
import auth, gmail_client, emailer
creds = auth.get_credentials()
service = gmail_client.build_service(creds)
send_raw = gmail_client.send_raw_via_gmail(service)
emailer.send_prospect_email(send_raw, prospect, booking, gamma_url)
emailer.send_bdr_email(send_raw, prospect, booking, bdr_email="you@example.com",
                        call_platform_url="https://calls.example.com/rec/xyz")  # placeholder until real link is known
```
`call_platform_url` is a placeholder param — swap it for the real call-recording link once available, one line, no template changes needed.

---

## POC 4 — Two-page live broadcast (prospect + sales monitor)

**Proves**: a second, read-only browser page can watch a live call's transcript in real time on a different device, while the first page holds the mic.

**Files**: `main.py` (`BroadcastWebSocket`, `/ws/sales`, `/sales` route), `static/sales.html`.

**Design**: `gradbot.websocket.handle_session()` only ever talks to one websocket object.
`BroadcastWebSocket` is a thin wrapper implementing the same interface
(`accept`/`receive`/`receive_json`/`send_json`/`send_bytes`/`close`) that gradbot's
internals call — reads pass through to the real prospect-side websocket, but every
`send_json` call is *also* mirrored to any connected sales-page viewers (a plain
`set[WebSocket]`, best-effort — a broken viewer connection is silently dropped). Audio
bytes are **not** mirrored (the sales page doesn't need to hear the call, only read it).

Because `on_tool_call(handle, input_handle, websocket)` receives that same wrapped
`websocket`, any custom event you push from a tool-call handler
(e.g. `await websocket.send_json({"type": "booking_confirmed", ...})`) automatically
reaches the sales page too, for free.

**Gotcha hit**: the first version of `sales.html` keyed transcript bubbles by
`turn_idx` for *both* user and assistant text. Assistant `turn_idx` increments
reliably per turn; **user/STT `turn_idx` does not** — it doesn't uniquely
identify separate user utterances. Result: every user utterance in the whole
call kept appending into one giant garbled bubble. Fix (already applied): copy
the flip-flop heuristic from the original `static/index.html` — track a single
"current user bubble" and only start a new one once an assistant bubble has
appeared since the last one. Any new page that renders this transcript must
reuse this exact logic, not re-derive it from `turn_idx`.

**Wire format** the sales page listens for on `/ws/sales`: gradbot's own schema
types (`user_text`, `agent_text`, `error`, all with `.text`/`.turn_idx`), plus
any custom dict you send directly on the wrapped websocket (`booking_confirmed`,
`deck_ready` are the two `sales.html` already has banner-rendering for).

---

## POC 5 — ngrok tunnel for real phone-mic testing

**Proves**: the prospect page can be opened on an actual phone (not just a laptop), using the phone's real mic/speaker.

**Why needed**: browsers only grant `getUserMedia()` (mic access) over HTTPS or `localhost`. A plain LAN IP (`http://192.168.x.x:8000`) gets mic access silently denied on mobile. ngrok's free HTTPS tunnel solves that with zero code changes.

**Setup**:
```
winget install ngrok.ngrok      # installer was outdated (3.3.1); run `ngrok update` once installed
ngrok config add-authtoken <token>   # free account required, dashboard.ngrok.com
ngrok http 8000
```
Get the public URL from `http://127.0.0.1:4040/api/tunnels` or the ngrok terminal output.

**Gotcha hit**: winget's packaged ngrok build (3.3.1) is too old for current free-tier accounts (`ERR_NGROK_121`, minimum agent version 3.20.0) — run `ngrok update` immediately after install.

**Caveat to repeat to whoever runs the live demo**: the ngrok URL is public on the internet for as long as the tunnel is open, and this app can create real Calendar events, send real emails, and spend real API credits. Close the tunnel right after the demo.

---

## POC 6 — Voice call + tool-calling (pre-existing, verified further)

**Proves**: `gradbot` supports live tool-calling mid-conversation — the LLM can decide to call a tool, your Python code handles it async, and the result feeds back into the conversation.

**Key API** (`gradbot.websocket.handle_session`): pass `on_tool_call(handle, input_handle, websocket)`.
`handle.name` / `handle.args` (already-parsed dict) tell you which tool and with what arguments;
`await handle.send_json(result)` / `await handle.send_error(msg)` respond to the LLM.
See `main.py`'s existing `get_time` tool and the parallel `add_meeting`/`send_email` tools
on `/ws/prospect-call` (built by a teammate for a Next.js frontend) for two working examples.

**Not yet proven**: this repo has never had a tool call that (a) parses a natural-language
time the LLM produced into something `booking.create_booking` can consume, or (b) triggers
the full booking → email → deck chain from inside `on_tool_call`. That's the real remaining
integration risk — see below.

**Also not yet proven**: the French-accented-voice-speaking-English-content trick. It's
architecturally sound — `SessionConfig.language` (content language) and `SessionConfig.voice_id`
(which Gradium voice model) are independent fields, confirmed by reading `gradbot/_gradbot.pyi`
and `gradbot/voices.py` — but nobody has actually run a call with `language=Lang.En` and a
French-tagged `voice_id` yet. Do this before it's part of a real demo:
```python
voices = await gradbot.voices.load_catalog(base_url, api_key)
fr_voice = next(v for v in voices if v.language == "fr")
config = gradbot.SessionConfig(voice_id=fr_voice.voice_id, language=gradbot.Lang.En, ...)
```

---

## Wiring the full flow (what's left, in order)

1. **`prospect.py`** (doesn't exist yet): load a `Prospect` from wherever the upstream
   pipeline hands it off, build a `gradbot.SessionConfig` with a personalized system
   prompt (name/company/job_title/context baked in, objective = book a qualification
   call), the French-voice-and-English-content combo from POC 6, and one
   `gradbot.ToolDef("book_qualification_call", ..., parameters_json=<schema requiring
   an ISO-8601 datetime>)`.

2. **The real `on_tool_call` handler**, replacing the `get_time` stub in `main.py`:
   ```python
   async def on_tool_call(handle, input_handle, websocket):
       if handle.name == "book_qualification_call":
           when = datetime.datetime.fromisoformat(handle.args["datetime"])  # validate this — see below
           result = booking.create_booking(calendar_client.insert_event_via_api(cal_service), prospect, when)
           await handle.send_json({"status": "booked", "when": result.start_time.isoformat()})
           await websocket.send_json({"type": "booking_confirmed", "start_time": ...})  # sales.html already renders this

           send_raw = gmail_client.send_raw_via_gmail(gmail_service)
           emailer.send_bdr_email(send_raw, prospect, result, bdr_email=...)  # fires immediately, doesn't wait on the deck

           asyncio.create_task(_finish_deck_and_email(prospect, result, send_raw, websocket))
       else:
           await handle.send_error(f"Unknown tool: {handle.name}")

   async def _finish_deck_and_email(prospect, booking_result, send_raw, websocket):
       try:
           gamma_url = deck.generate_deck(prospect, gamma_client.submit_via_api(key), gamma_client.poll_via_api(key), time.sleep)
           emailer.send_prospect_email(send_raw, prospect, booking_result, gamma_url)
           await websocket.send_json({"type": "deck_ready", "gamma_url": gamma_url})  # best-effort, sales.html renders this too
       except Exception:
           logger.exception("deck/email pipeline failed")  # booking already succeeded — don't crash the call over this
   ```
   Note `deck.generate_deck`'s `sleep` is a **blocking** `time.sleep` — since this whole
   function runs inside `asyncio.create_task`, that blocks the event loop for the ~20s
   poll duration and will stall the live call's audio. **Use `asyncio.sleep` and an async
   HTTP client instead of `requests`/`time.sleep` for the real integration** — the sync
   versions in `gamma_client.py`/`deck.py` were fine for a one-off script test, not for
   running inside a live voice session's event loop.

3. **Datetime parsing is the biggest untested risk.** The tool schema should ask the LLM
   for a strict ISO-8601 datetime (put that explicitly in the tool's `parameters_json`
   description), but LLMs sometimes still produce relative or malformed strings.
   Validate defensively in `on_tool_call` and `await handle.send_error(...)` with a
   specific, LLM-readable message (e.g. "please provide the date as YYYY-MM-DDTHH:MM")
   so the bot can recover in-conversation rather than crashing the tool call.

4. **Test it live before the real demo**: run a full call end to end (real voice, real
   agreement to a time), and confirm — in this order — the Calendar event appears, the
   BDR email arrives immediately, the sales-page banner shows "Booking confirmed", the
   deck finishes generating in the background without blocking the still-ongoing call,
   and the prospect email + `deck_ready` banner both land afterward.

## Environment variables (already in `.env`, gitignored)
`GRADIUM_API_KEY`, `OPENROUTER_API_KEY`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`,
`GAMMA_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`. Plus `services/.credentials/client_secret.json`
and the cached `.credentials/token.json` (both gitignored, OAuth for Calendar+Gmail).
