"""Google Calendar booking: build an event body, insert it, return a BookingResult."""

import datetime
from typing import Callable

from models import BookingResult, Prospect

InsertEventFn = Callable[[dict], dict]

DURATION = datetime.timedelta(minutes=30)


def build_event_body(prospect: Prospect, when: datetime.datetime) -> dict:
    return {
        "summary": f"Qualification call — {prospect.name} ({prospect.company})",
        "description": prospect.context,
        "start": {"dateTime": when.isoformat()},
        "end": {"dateTime": (when + DURATION).isoformat()},
        "attendees": [{"email": prospect.email}],
    }


def create_booking(
    insert_event: InsertEventFn, prospect: Prospect, when: datetime.datetime
) -> BookingResult:
    inserted = insert_event(build_event_body(prospect, when))
    return BookingResult(event_link=inserted["htmlLink"], start_time=when)
