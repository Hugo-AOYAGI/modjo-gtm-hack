import datetime

import booking
from models import Prospect

PROSPECT = Prospect(
    name="Jane Doe",
    company="Acme Corp",
    job_title="VP of Operations",
    context="Struggling with late deliveries during peak season.",
    email="jane@acme.com",
    phone="+1-555-0100",
)

WHEN = datetime.datetime(2026, 7, 10, 15, 0, tzinfo=datetime.timezone.utc)


def test_build_event_body_invites_the_prospect():
    body = booking.build_event_body(PROSPECT, WHEN)

    assert body["attendees"] == [{"email": "jane@acme.com"}]


def test_build_event_body_summary_mentions_prospect_and_company():
    body = booking.build_event_body(PROSPECT, WHEN)

    assert "Jane Doe" in body["summary"]
    assert "Acme Corp" in body["summary"]


def test_build_event_body_description_is_the_context():
    body = booking.build_event_body(PROSPECT, WHEN)

    assert body["description"] == PROSPECT.context


def test_build_event_body_is_thirty_minutes_long():
    body = booking.build_event_body(PROSPECT, WHEN)

    start = datetime.datetime.fromisoformat(body["start"]["dateTime"])
    end = datetime.datetime.fromisoformat(body["end"]["dateTime"])
    assert end - start == datetime.timedelta(minutes=30)


def test_create_booking_inserts_event_and_returns_result():
    inserted = {"htmlLink": "https://calendar.google.com/event?eid=abc123"}

    result = booking.create_booking(
        insert_event=lambda body: inserted,
        prospect=PROSPECT,
        when=WHEN,
    )

    assert result.event_link == "https://calendar.google.com/event?eid=abc123"
    assert result.start_time == WHEN
