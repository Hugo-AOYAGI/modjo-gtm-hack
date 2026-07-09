"""Shared Google OAuth grant for Calendar (booking) + Gmail (handoff emails).

One-time setup:
1. Google Cloud Console -> OAuth client ID (Desktop app) -> download JSON
   as `.credentials/client_secret.json` (gitignored).
2. First call to get_credentials() opens a browser for consent and caches
   a refresh token to `.credentials/token.json`. Later calls reuse it silently.
"""

import pathlib

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.send",
]

# auth.py lives in services/clients/, credentials sit at services/.credentials/
CREDENTIALS_DIR = pathlib.Path(__file__).parent.parent / ".credentials"
CLIENT_SECRET_PATH = CREDENTIALS_DIR / "client_secret.json"
TOKEN_PATH = CREDENTIALS_DIR / "token.json"


def get_credentials() -> Credentials:
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())

    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET_PATH), SCOPES)
        creds = flow.run_local_server(port=0)
        CREDENTIALS_DIR.mkdir(exist_ok=True)
        TOKEN_PATH.write_text(creds.to_json())

    return creds
