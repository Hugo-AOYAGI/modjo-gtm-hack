import pytest

import deck
from models import Prospect

PROSPECT = Prospect(
    name="Jane Doe",
    company="Acme Corp",
    job_title="VP of Operations",
    context="Struggling with late deliveries during peak season.",
    email="jane@acme.com",
    phone="+1-555-0100",
)


def test_build_input_text_mentions_company_job_and_context():
    text = deck.build_input_text(PROSPECT)

    assert PROSPECT.company in text
    assert PROSPECT.job_title in text
    assert PROSPECT.context in text


def test_generate_deck_polls_until_completed_and_returns_gamma_url():
    poll_responses = iter([
        {"status": "pending"},
        {"status": "pending"},
        {"status": "completed", "gammaUrl": "https://gamma.app/docs/abc123"},
    ])
    sleeps = []

    url = deck.generate_deck(
        PROSPECT,
        submit=lambda input_text: "gen1",
        poll=lambda generation_id: next(poll_responses),
        sleep=sleeps.append,
    )

    assert url == "https://gamma.app/docs/abc123"
    assert sleeps == [5, 5]


def test_generate_deck_raises_on_failed_status():
    with pytest.raises(deck.GenerationFailed):
        deck.generate_deck(
            PROSPECT,
            submit=lambda input_text: "gen1",
            poll=lambda generation_id: {"status": "failed"},
            sleep=lambda s: None,
        )
