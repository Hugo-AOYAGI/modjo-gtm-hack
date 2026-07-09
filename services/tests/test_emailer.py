import base64
import datetime
from email import message_from_bytes, policy

from models import BookingResult, Prospect
import emailer

PROSPECT = Prospect(
    name="Jane Doe",
    company="Acme Corp",
    job_title="VP of Operations",
    context="Struggling with late deliveries during peak season.",
    email="jane@acme.com",
    phone="+1-555-0100",
)

BOOKING = BookingResult(
    event_link="https://calendar.google.com/event?eid=abc123",
    start_time=datetime.datetime(2026, 7, 10, 15, 0, tzinfo=datetime.timezone.utc),
)


def plain_text(msg):
    return msg.get_body(preferencelist=("plain",)).get_content()


def html_body(msg):
    return msg.get_body(preferencelist=("html",)).get_content()


def test_build_prospect_message_addresses_the_prospect():
    msg = emailer.build_prospect_message(PROSPECT, BOOKING, gamma_url="https://gamma.app/docs/abc123")

    assert msg["To"] == "jane@acme.com"


def test_build_prospect_message_subject_mentions_company():
    msg = emailer.build_prospect_message(PROSPECT, BOOKING, gamma_url="https://gamma.app/docs/abc123")

    assert "Acme Corp" in msg["Subject"]


def test_build_prospect_message_plain_text_contains_deck_link():
    msg = emailer.build_prospect_message(PROSPECT, BOOKING, gamma_url="https://gamma.app/docs/abc123")

    assert "https://gamma.app/docs/abc123" in plain_text(msg)


def test_build_prospect_message_html_contains_booking_summary_and_deck_link():
    msg = emailer.build_prospect_message(PROSPECT, BOOKING, gamma_url="https://gamma.app/docs/abc123")
    html = html_body(msg)

    assert "https://gamma.app/docs/abc123" in html
    assert "Jane Doe" in html
    assert "Acme Corp" in html
    assert "July 10, 2026" in html


def test_build_bdr_message_addresses_the_bdr():
    msg = emailer.build_bdr_message(PROSPECT, BOOKING, bdr_email="bdr@modjo.ai")

    assert msg["To"] == "bdr@modjo.ai"


def test_build_bdr_message_subject_mentions_prospect_and_company():
    msg = emailer.build_bdr_message(PROSPECT, BOOKING, bdr_email="bdr@modjo.ai")

    assert "Jane Doe" in msg["Subject"]
    assert "Acme Corp" in msg["Subject"]


def test_build_bdr_message_plain_text_contains_prospect_context():
    msg = emailer.build_bdr_message(PROSPECT, BOOKING, bdr_email="bdr@modjo.ai")
    body = plain_text(msg)

    assert PROSPECT.job_title in body
    assert PROSPECT.context in body
    assert PROSPECT.phone in body
    assert PROSPECT.email in body
    assert BOOKING.event_link in body


def test_build_bdr_message_html_contains_prospect_briefing():
    msg = emailer.build_bdr_message(PROSPECT, BOOKING, bdr_email="bdr@modjo.ai")
    html = html_body(msg)

    assert PROSPECT.job_title in html
    assert PROSPECT.context in html
    assert PROSPECT.phone in html
    assert PROSPECT.email in html
    assert BOOKING.event_link in html


def test_build_bdr_message_html_links_to_call_platform():
    msg = emailer.build_bdr_message(
        PROSPECT, BOOKING, bdr_email="bdr@modjo.ai", call_platform_url="https://calls.example.com/rec/xyz"
    )
    html = html_body(msg)

    assert "https://calls.example.com/rec/xyz" in html


def test_send_prospect_email_sends_encoded_message_to_prospect():
    sent = []

    emailer.send_prospect_email(
        sent.append, PROSPECT, BOOKING, gamma_url="https://gamma.app/docs/abc123"
    )

    assert len(sent) == 1
    decoded = message_from_bytes(base64.urlsafe_b64decode(sent[0]), policy=policy.default)
    assert decoded["To"] == "jane@acme.com"
    assert "https://gamma.app/docs/abc123" in decoded.get_body(preferencelist=("html",)).get_content()


def test_send_bdr_email_sends_encoded_message_to_bdr():
    sent = []

    emailer.send_bdr_email(sent.append, PROSPECT, BOOKING, bdr_email="bdr@modjo.ai")

    assert len(sent) == 1
    decoded = message_from_bytes(base64.urlsafe_b64decode(sent[0]), policy=policy.default)
    assert decoded["To"] == "bdr@modjo.ai"
    assert PROSPECT.context in decoded.get_body(preferencelist=("html",)).get_content()
