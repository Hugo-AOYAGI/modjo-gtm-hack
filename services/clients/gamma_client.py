"""Thin adapter turning the Gamma API into deck.SubmitFn / deck.PollFn callables."""

import requests

BASE_URL = "https://public-api.gamma.app/v1.0"


def submit_via_api(api_key: str):
    def submit(input_text: str) -> str:
        resp = requests.post(
            f"{BASE_URL}/generations",
            headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
            json={
                "inputText": input_text,
                "format": "presentation",
                "numCards": 6,
                "textMode": "generate",
                "textOptions": {
                    "tone": "professional, consultative",
                    "audience": "executives",
                },
            },
        )
        resp.raise_for_status()
        return resp.json()["generationId"]

    return submit


def poll_via_api(api_key: str):
    def poll(generation_id: str) -> dict:
        resp = requests.get(
            f"{BASE_URL}/generations/{generation_id}",
            headers={"X-API-KEY": api_key},
        )
        resp.raise_for_status()
        return resp.json()

    return poll
