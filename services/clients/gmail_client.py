"""Thin adapter turning a Gmail API service into an emailer.SendRaw callable."""

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from emailer import SendRaw


def build_service(creds: Credentials):
    return build("gmail", "v1", credentials=creds)


def send_raw_via_gmail(service) -> SendRaw:
    def send_raw(raw: str) -> None:
        # num_retries → googleapiclient retries transient connection aborts / 5xx.
        service.users().messages().send(
            userId="me", body={"raw": raw}
        ).execute(num_retries=3)

    return send_raw
