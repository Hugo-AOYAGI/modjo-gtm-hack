"""Thin adapter turning a Calendar API service into booking.InsertEventFn."""

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from booking import InsertEventFn


def build_service(creds: Credentials):
    return build("calendar", "v3", credentials=creds)


def insert_event_via_api(service) -> InsertEventFn:
    def insert_event(body: dict) -> dict:
        # num_retries lets googleapiclient retry transient failures
        # (connection aborts / 5xx) with backoff — belt-and-braces on top of
        # the fresh-per-thread service.
        return (
            service.events()
            .insert(calendarId="primary", body=body, sendUpdates="all")
            .execute(num_retries=3)
        )

    return insert_event
