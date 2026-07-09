"""Gmail-based handoff emails: prospect confirmation + BDR briefing.

HTML templates follow Modjo's product-email style: a black circular
soundwave mark, a soft-yellow highlight pill for the brand name, bordered
rounded "card" sections, and a blue pill CTA button.
"""

import base64
from email.message import EmailMessage
from typing import Callable

from models import BookingResult, Prospect

SendRaw = Callable[[str], None]

INK = "#16161a"
INK_SOFT = "#5c5c66"
HIGHLIGHT_BG = "#fbe28a"
BUTTON_BG = "#4453f4"
CARD_SHADOW = "0 1px 2px rgba(16,16,20,0.04), 0 4px 16px rgba(16,16,20,0.06)"
FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

LOGO_URL = (
    "https://cdn.prod.website-files.com/620654d03cff54dabf8468b6/"
    "66fc0b949ce0742578d265da_logo.svg"
)

_LOGO_HTML = (
    f'<img src="{LOGO_URL}" width="140" height="37" alt="Modjo" '
    f'style="display:block; border:0;">'
)


def _highlight(text: str) -> str:
    return (
        f'<span style="background:{HIGHLIGHT_BG}; padding:2px 6px; '
        f'border-radius:6px; font-weight:600;">{text}</span>'
    )


def _chip(text: str) -> str:
    return (
        f'<span style="display:inline-block; background:#f2f2f5; color:{INK_SOFT}; '
        f'font-size:13px; font-weight:500; padding:6px 12px; border-radius:100px; '
        f'margin:0 0 22px;">{text}</span>'
    )


def _button(label: str, href: str) -> str:
    return (
        f'<a href="{href}" style="display:inline-block; background:{BUTTON_BG}; '
        f'color:#ffffff; font-weight:600; text-decoration:none; padding:13px 24px; '
        f'border-radius:12px; font-size:15px; letter-spacing:-0.01em; '
        f'box-shadow:0 2px 8px rgba(68,83,244,0.28);">{label}</a>'
    )


def _card(inner_html: str) -> str:
    return (
        f'<div style="background:#ffffff; border-radius:18px; box-shadow:{CARD_SHADOW}; '
        f'padding:24px; margin:14px 0;">{inner_html}</div>'
    )


def _shell(inner_html: str) -> str:
    return f"""
<html>
  <body style="margin:0; padding:0; background:#f4f3f6;">
    <div style="max-width:560px; margin:0 auto; padding:40px 24px 56px; font-family:{FONT_STACK}; color:{INK}; -webkit-font-smoothing:antialiased;">
      {_LOGO_HTML}
      <div style="height:28px;"></div>
      {inner_html}
    </div>
  </body>
</html>
""".strip()


def _format_when(booking: BookingResult) -> str:
    return f"{booking.start_time:%A, %B %d, %Y}"


def _format_when_time(booking: BookingResult) -> str:
    return f"{booking.start_time:%H:%M %Z}".strip()


def render_prospect_html(prospect: Prospect, booking: BookingResult, gamma_url: str) -> str:
    heading = f"Your call with {_highlight('Modjo')} is booked"
    meta = _chip(f"{_format_when(booking)} &middot; 30 minutes")
    body = _card(
        f"<p style='margin:0 0 10px; font-weight:600; letter-spacing:-0.01em;'>What we'll cover</p>"
        f"<p style='margin:0; color:{INK_SOFT}; line-height:1.6;'>{prospect.context}</p>"
    )
    deck = _card(
        f"<p style='margin:0 0 10px; font-weight:600; letter-spacing:-0.01em;'>Your tailored deck</p>"
        f"<p style='margin:0 0 18px; color:{INK_SOFT}; line-height:1.6;'>"
        f"A few slides on how {prospect.company} can get the most out of Modjo.</p>"
        f"{_button('View your deck →', gamma_url)}"
    )
    return _shell(
        f"<p style='margin:0 0 6px; font-size:14px; color:{INK_SOFT};'>Hi {prospect.name},</p>"
        f"<h1 style='font-size:24px; font-weight:700; letter-spacing:-0.02em; line-height:1.3; margin:0 0 14px;'>{heading}</h1>"
        f"{meta}"
        f"{body}{deck}"
    )


def render_bdr_html(prospect: Prospect, booking: BookingResult, call_platform_url: str) -> str:
    heading = f"New qualification call booked with {_highlight(prospect.name)}"
    meta = _chip(f"{_format_when(booking)} &middot; {_format_when_time(booking)} &middot; 30 minutes")
    briefing = _card(
        f"<p style='margin:0 0 14px; font-weight:600; letter-spacing:-0.01em;'>What to know about {prospect.name}</p>"
        f"<p style='margin:0 0 6px;'><b>Company:</b> {prospect.company}</p>"
        f"<p style='margin:0 0 6px;'><b>Title:</b> {prospect.job_title}</p>"
        f"<p style='margin:0 0 6px;'><b>Phone:</b> {prospect.phone}</p>"
        f"<p style='margin:0 0 14px;'><b>Email:</b> {prospect.email}</p>"
        f"<p style='margin:0; color:{INK_SOFT}; line-height:1.6;'>{prospect.context}</p>"
    )
    listen = _card(
        f"<p style='margin:0 0 14px; font-weight:600; letter-spacing:-0.01em;'>Hear how it went</p>"
        f"{_button('Listen to the conversation →', call_platform_url)}"
    )
    calendar_link = (
        f"<p style='margin:18px 4px 0; font-size:13px;'>"
        f"<a href='{booking.event_link}' style='color:{BUTTON_BG}; font-weight:500;'>View in Calendar</a></p>"
    )
    return _shell(
        f"<h1 style='font-size:24px; font-weight:700; letter-spacing:-0.02em; line-height:1.3; margin:0 0 14px;'>{heading}</h1>"
        f"{meta}"
        f"{briefing}{listen}{calendar_link}"
    )


def _encode(msg: EmailMessage) -> str:
    return base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")


def build_prospect_message(
    prospect: Prospect, booking: BookingResult, gamma_url: str
) -> EmailMessage:
    msg = EmailMessage()
    msg["To"] = prospect.email
    msg["Subject"] = f"Following up for {prospect.company}"
    msg.set_content(
        f"Hi {prospect.name},\n\n"
        f"Your call with Modjo is booked for {_format_when(booking)}. As promised, "
        f"here's a bit more on how we can help {prospect.company}:\n\n{gamma_url}\n\n"
        "Looking forward to the call."
    )
    msg.add_alternative(render_prospect_html(prospect, booking, gamma_url), subtype="html")
    return msg


def build_bdr_message(
    prospect: Prospect,
    booking: BookingResult,
    bdr_email: str,
    call_platform_url: str = "#",
) -> EmailMessage:
    msg = EmailMessage()
    msg["To"] = bdr_email
    msg["Subject"] = f"Qualification call booked: {prospect.name} ({prospect.company})"
    msg.set_content(
        f"New qualification call booked for {booking.start_time:%A %b %d, %H:%M %Z}.\n\n"
        f"Prospect: {prospect.name}\n"
        f"Company: {prospect.company}\n"
        f"Title: {prospect.job_title}\n"
        f"Phone: {prospect.phone}\n"
        f"Email: {prospect.email}\n\n"
        f"Context: {prospect.context}\n\n"
        f"Calendar event: {booking.event_link}\n"
        f"Conversation: {call_platform_url}"
    )
    msg.add_alternative(
        render_bdr_html(prospect, booking, call_platform_url), subtype="html"
    )
    return msg


def send_prospect_email(
    send_raw: SendRaw, prospect: Prospect, booking: BookingResult, gamma_url: str
) -> None:
    send_raw(_encode(build_prospect_message(prospect, booking, gamma_url)))


def send_bdr_email(
    send_raw: SendRaw,
    prospect: Prospect,
    booking: BookingResult,
    bdr_email: str,
    call_platform_url: str = "#",
) -> None:
    send_raw(
        _encode(build_bdr_message(prospect, booking, bdr_email, call_platform_url))
    )
