"""Live prospect-call booking pipeline (FastAPI backend for the prospect-flow app)."""

import asyncio
import datetime
import itertools
import logging
import os
import pathlib

import dotenv
import fastapi
import gradbot
from fastapi.middleware.cors import CORSMiddleware

import booking
import emailer
from clients import auth, calendar_client, gmail_client
from models import Prospect

dotenv.load_dotenv()

logger = logging.getLogger("prospect_flow")

# Real recipients for the demo (calendar invite + follow-ups land here).
BDR_EMAIL = "aoyagihugo@gmail.com"
PROSPECT_EMAIL = "hugo.aoyagi@gmail.com"
# Pre-made deck shown in the prospect follow-up email + the timeline deck card.
DECK_URL = os.environ.get(
    "DECK_URL",
    "https://gamma.app/docs/Thank-you-for-your-interest-Alexandre-vnz9e3aqdut9j87",
)
# Real Modjo recording of the call — linked from the BDR briefing email.
CALL_RECORDING_URL = os.environ.get(
    "CALL_RECORDING_URL",
    "https://staging.app.modjo.ai/call/eyJ0ZW5hbnROYW1lIjoibW9kam8iLCJ1dWlkIjoiZmUzYjVhMDEtMDJlNi00ZDdjLTliZWEtZmNhOGM4YjE0OTNjIiwic2hhcmVySWQiOjU0MzAsInNoYXJlck5hbWUiOiJIdWdvIEFveWFnaSJ9?utm_medium=share_link_call",
)

gradbot.init_logging()
app = fastapi.FastAPI(title="Prospect Flow Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
cfg = gradbot.config.from_env()

sales_viewers: set[fastapi.WebSocket] = set()
phone_clients: set[fastapi.WebSocket] = set()

# Cross-request demo state: the prospect being called, ring status, last booking.
SESSION: dict = {"prospect": None, "booking": None}
ring_state: dict = {"active": False, "prospect": None}
# The live prospect-call websocket, so the sales page can force-hang it.
active_call: dict = {"ws": None}
# Monotonic id per prospect-call session, for lifecycle tracing in the log.
_session_seq = itertools.count(1)

# Lazily-built Google API services (OAuth token is already cached).
_google: dict = {}


def _google_services():
    if "cal" not in _google:
        creds = auth.get_credentials()
        _google["cal"] = calendar_client.build_service(creds)
        _google["gmail"] = gmail_client.build_service(creds)
    return _google["cal"], _google["gmail"]


# Milestone events for the current call cycle (call_started, tool_event,
# booking_confirmed, email, deck_ready, call_ended). Replayed to any sales
# viewer that connects/reconnects, so a socket blip can't lose the flow state.
call_events: list[dict] = []


async def _broadcast(payload: dict) -> None:
    """Send a JSON event to every connected sales-monitor viewer."""
    for viewer in list(sales_viewers):
        try:
            await viewer.send_json(payload)
        except Exception:
            sales_viewers.discard(viewer)


async def _emit(payload: dict) -> None:
    """Record a milestone (for replay) and broadcast it to sales viewers."""
    call_events.append(payload)
    await _broadcast(payload)


class BroadcastWebSocket:
    """Wraps the prospect-side websocket; mirrors outgoing JSON to sales viewers.

    gradbot.websocket.handle_session only talks to one websocket, so this lets
    a read-only "sales" page watch the same live call (transcript, tool
    events) without touching the mic/audio side.
    """

    def __init__(self, websocket: fastapi.WebSocket, viewers: set[fastapi.WebSocket]):
        self._ws = websocket
        self._viewers = viewers

    async def accept(self):
        await self._ws.accept()

    async def receive_json(self):
        return await self._ws.receive_json()

    async def receive(self):
        return await self._ws.receive()

    async def close(self, *args, **kwargs):
        await self._ws.close(*args, **kwargs)

    async def send_bytes(self, data):
        await self._ws.send_bytes(data)

    async def send_json(self, data):
        await self._ws.send_json(data)
        for viewer in list(self._viewers):
            try:
                await viewer.send_json(data)
            except Exception:
                self._viewers.discard(viewer)

DEFAULT_VOICE_ID = "cLONiZ4hQ8VpQ4Sz"  # Skyler


@app.websocket("/ws/sales")
async def ws_sales(websocket: fastapi.WebSocket):
    await websocket.accept()
    # Replay milestones so a fresh/reconnecting monitor catches up on call state.
    for event in list(call_events):
        try:
            await websocket.send_json(event)
        except Exception:
            await websocket.close()
            return
    sales_viewers.add(websocket)
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
    except (fastapi.WebSocketDisconnect, RuntimeError):
        pass
    finally:
        sales_viewers.discard(websocket)


@app.get("/phone")
async def phone_page():
    """Prospect phone page — served same-origin so a single ngrok tunnel works."""
    return fastapi.responses.FileResponse(
        pathlib.Path(__file__).parent / "static" / "phone.html"
    )


# --- prospect-flow live call (sales monitor + phone) -----------------------

PROSPECT_SYSTEM_PROMPT = """You are Maud, an AI sales rep calling on behalf of
Modjo — a conversation-intelligence platform that helps sales teams automate
their repetitive work (call notes, CRM updates, follow-ups).

You are on a live call with {name}, {title} at {company}. Today is {today}.

Follow this flow, naturally and warmly:
1. Open by disclosing you're an AI, with light humour — you never need coffee,
   you don't get nervous, and you promise to be quicker than most reps. Ask how
   they're doing.
2. Congratulate them on a real signal: {company} recently hired three new
   Account Executives. Ask if the new reps have started / how it's going.
3. Pitch in a few words — "Modjo automates your reps' busywork" — then ask how
   they handle that today.
4. Respect their time — keep it short. Propose a quick chat with Tom (a Modjo
   BDR) this week.
5. As soon as they agree to a time, call book_qualification_call with the exact
   date-time in ISO-8601 (YYYY-MM-DDTHH:MM:SS). Resolve relative times
   ("Thursday at 10") against today's date yourself.
6. Confirm the day/time out loud, tell them you'll send a confirmation email
   right away, and wrap up warmly.

RULES:
- Keep every response to ONE short sentence — this is a fast live voice call.
- Be warm, witty, and human, never robotic or pushy.
- The meeting is with Tom, a BDR — not with you."""

PROSPECT_TOOLS = [
    gradbot.ToolDef(
        "book_qualification_call",
        "Book the qualification call once the prospect agrees to a specific time.",
        '{"type": "object", "properties": {"datetime": {"type": "string", '
        '"description": "ISO-8601 date-time, e.g. 2026-07-15T15:00:00"}}, '
        '"required": ["datetime"]}',
    ),
]


def make_prospect_config(msg: dict) -> gradbot.SessionConfig:
    prospect: Prospect | None = SESSION.get("prospect")
    instructions = PROSPECT_SYSTEM_PROMPT.format(
        name=prospect.name if prospect else "the prospect",
        title=prospect.job_title if prospect else "",
        company=prospect.company if prospect else "their company",
        today=datetime.date.today().strftime("%A, %B %d, %Y"),
    )
    # Our explicit turn-taking settings must win over cfg defaults (which
    # already carry flush_duration_s=0.5), so merge them AFTER cfg.session_kwargs.
    return gradbot.SessionConfig(
        voice_id=DEFAULT_VOICE_ID,
        instructions=instructions,
        tools=PROSPECT_TOOLS,
        **(cfg.session_kwargs | {
            "assistant_speaks_first": True,  # Maud greets first — no user input needed
            "silence_timeout_s": 10.0,       # wait 10s of silence before re-engaging
            "flush_duration_s": 1.0,         # 1s pause before treating a turn as done
        }),
    )


async def on_prospect_tool_call(handle, input_handle, websocket):
    if handle.name != "book_qualification_call":
        await handle.send_error(f"Unknown tool: {handle.name}")
        return

    prospect: Prospect | None = SESSION.get("prospect")
    if prospect is None:
        await handle.send_error("No prospect is loaded for this call.")
        return

    # Idempotent: one booking per call. If the LLM calls the tool again, just
    # re-confirm the existing slot — never create a second event or banner.
    existing = SESSION.get("booking")
    if existing is not None:
        await handle.send_json(
            {"status": "already_booked", "when": existing.start_time.isoformat()}
        )
        return

    raw = handle.args.get("datetime", "")
    try:
        when = datetime.datetime.fromisoformat(raw)
    except ValueError:
        await handle.send_error(
            "Please provide the date as ISO-8601, e.g. 2026-07-15T15:00:00"
        )
        return
    if when.tzinfo is None:
        when = when.astimezone()  # treat a bare datetime as local time

    try:
        cal_service, _ = await asyncio.to_thread(_google_services)
        result = await asyncio.to_thread(
            booking.create_booking,
            calendar_client.insert_event_via_api(cal_service),
            prospect,
            when,
        )
    except Exception:
        logger.exception("calendar booking failed")
        await handle.send_error("The calendar booking failed — try another time.")
        return

    SESSION["booking"] = result
    detail = when.strftime("%A %b %d, %H:%M")
    await _emit(
        {"type": "tool_event", "kind": "meeting", "label": "Meeting booked", "detail": detail}
    )
    await _emit(
        {
            "type": "booking_confirmed",
            "start_time": result.start_time.isoformat(),
            "event_link": result.event_link,
        }
    )
    await handle.send_json({"status": "booked", "when": result.start_time.isoformat()})


def _default_slot() -> datetime.datetime:
    """A fallback meeting time (tomorrow 10:00 local) if the LLM didn't book."""
    now = datetime.datetime.now().astimezone()
    return (now + datetime.timedelta(days=1)).replace(
        hour=10, minute=0, second=0, microsecond=0
    )


async def _send_followups(prospect: Prospect, result) -> None:
    """After the call: surface the deck + send the two real branded emails.

    These are emitted as `artifact` milestones so the sales timeline renders
    them as their own post-call cards (deck card + two email cards).
    """
    _, gmail_service = await asyncio.to_thread(_google_services)
    send_raw = gmail_client.send_raw_via_gmail(gmail_service)
    first = prospect.name.split(" ")[0]

    # 1. Deck (pre-made presentation link).
    await _emit(
        {
            "type": "artifact",
            "artifact": "deck",
            "title": f"Modjo × {prospect.company}",
            "slides": 8,
            "subtitle": f"tailored to {first}'s priorities",
            "url": DECK_URL,
        }
    )

    # 2. BDR briefing email (links to the real Modjo call recording).
    await asyncio.to_thread(
        emailer.send_bdr_email, send_raw, prospect, result, BDR_EMAIL, CALL_RECORDING_URL
    )
    await _emit(
        {
            "type": "artifact",
            "artifact": "email",
            "recipientKind": "bdr",
            "to": BDR_EMAIL,
            "subject": f"Qualification call booked: {prospect.name} ({prospect.company})",
            "preview": "Call summary, company context, and calendar link — ready for follow-up.",
        }
    )

    # 3. Prospect follow-up email with the deck.
    await asyncio.to_thread(
        emailer.send_prospect_email, send_raw, prospect, result, DECK_URL
    )
    await _emit(
        {
            "type": "artifact",
            "artifact": "email",
            "recipientKind": "prospect",
            "to": prospect.email,
            "subject": f"Following up for {prospect.company}",
            "preview": "Your call is booked — here's a tailored deck on how Modjo can help.",
        }
    )
    logger.info("post-call follow-ups sent (deck + 2 emails)")


@app.post("/api/dial")
async def api_dial(payload: dict):
    """Sales page dials: load the prospect and ring the phone page."""
    name = payload.get("name") or "there"
    company = payload.get("company") or "their company"
    title = payload.get("title") or ""
    SESSION["prospect"] = Prospect(
        name=name,
        company=company,
        job_title=title,
        context=payload.get("context")
        or f"{company} recently hired three new Account Executives and is scaling its "
        f"sales org — strong fit for Modjo's conversation intelligence.",
        email=PROSPECT_EMAIL,
        phone=payload.get("phone") or "+33 6 12 34 56 78",
    )
    SESSION["booking"] = None
    call_events.clear()  # fresh milestone log for this call cycle
    ring_state["active"] = True
    ring_state["prospect"] = {"name": name, "title": title, "company": company}

    for phone in list(phone_clients):
        try:
            await phone.send_json({"type": "incoming", "prospect": ring_state["prospect"]})
        except Exception:
            phone_clients.discard(phone)
    return {"status": "ringing"}


@app.post("/api/hangup")
async def api_hangup():
    """Force-end the live call from the sales page (double-space)."""
    ring_state["active"] = False
    ws = active_call.get("ws")
    if ws is not None:
        try:
            await ws.close()  # breaks the session loop -> triggers call_ended + emails
        except Exception:
            pass
    else:
        # nothing answered yet — still let the sales flow move on
        await _emit({"type": "call_ended"})
    return {"status": "hangup"}


@app.websocket("/ws/phone")
async def ws_phone(websocket: fastapi.WebSocket):
    """Control channel for the prospect phone — delivers 'incoming call' rings."""
    await websocket.accept()
    phone_clients.add(websocket)
    try:
        if ring_state["active"]:
            await websocket.send_json({"type": "incoming", "prospect": ring_state["prospect"]})
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
    except (fastapi.WebSocketDisconnect, RuntimeError):
        pass
    finally:
        phone_clients.discard(websocket)


@app.websocket("/ws/prospect-call")
async def ws_prospect_call(websocket: fastapi.WebSocket):
    """The prospect phone answers here (holds the mic); sales monitors via /ws/sales."""
    # Claim the active slot FIRST, then drop any previous session. Because we've
    # already claimed it, the displaced session sees active_call != itself and
    # finalizes silently — no phantom call_ended / booking leaking into this call.
    sid = next(_session_seq)
    client = getattr(websocket, "client", "?")
    logger.info("prospect-call #%d OPEN (client=%s)", sid, client)

    previous = active_call.get("ws")
    active_call["ws"] = websocket
    ring_state["active"] = False
    if previous is not None and previous is not websocket:
        logger.info("prospect-call #%d DISPLACES a previous live session", sid)
        try:
            await previous.close()
        except Exception:
            pass

    started_at = datetime.datetime.now()
    await _emit({"type": "call_started"})
    try:
        await gradbot.websocket.handle_session(
            BroadcastWebSocket(websocket, sales_viewers),
            config=cfg,
            on_start=make_prospect_config,
            on_tool_call=on_prospect_tool_call,
        )
        logger.info("prospect-call #%d handle_session returned normally", sid)
    except Exception:
        logger.exception("prospect-call #%d handle_session RAISED", sid)
    finally:
        _elapsed = (datetime.datetime.now() - started_at).total_seconds()
        logger.info(
            "prospect-call #%d END (elapsed=%.1fs, still_active=%s, booked=%s)",
            sid,
            _elapsed,
            active_call.get("ws") is websocket,
            SESSION.get("booking") is not None,
        )
        # Only the CURRENT session finalizes. A superseded/duplicate session
        # (displaced by a newer pickup) exits quietly — no events, no booking.
        if active_call.get("ws") is websocket:
            active_call["ws"] = None
            await _emit({"type": "call_ended"})

            prospect = SESSION.get("prospect")
            result = SESSION.get("booking")
            elapsed = (datetime.datetime.now() - started_at).total_seconds()
            # Only run the pipeline for a real call: either the LLM booked, or the
            # call actually lasted a bit. A blip/short session must NOT auto-book.
            substantial = elapsed >= 8
            if prospect is not None and (result is not None or substantial):
                try:
                    if result is None:
                        when = _default_slot()
                        cal_service, _ = await asyncio.to_thread(_google_services)
                        result = await asyncio.to_thread(
                            booking.create_booking,
                            calendar_client.insert_event_via_api(cal_service),
                            prospect,
                            when,
                        )
                        SESSION["booking"] = result
                        await _emit(
                            {
                                "type": "tool_event",
                                "kind": "meeting",
                                "label": "Meeting booked",
                                "detail": when.strftime("%A %b %d, %H:%M"),
                            }
                        )
                    await _send_followups(prospect, result)
                except Exception:
                    logger.exception("post-call pipeline failed")
                finally:
                    SESSION["prospect"] = None
            else:
                logger.info(
                    "skipping post-call pipeline (elapsed=%.1fs, booked=%s)",
                    elapsed,
                    result is not None,
                )


gradbot.routes.setup(
    app,
    config=cfg,
    static_dir=pathlib.Path(__file__).parent / "static",
    with_voices=True,
)
