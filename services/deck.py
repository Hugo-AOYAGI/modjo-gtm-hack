"""Gamma deck generation: submit + poll to completion."""

from typing import Callable

from models import Prospect

SubmitFn = Callable[[str], str]
PollFn = Callable[[str], dict]
SleepFn = Callable[[float], None]

POLL_INTERVAL_S = 5


class GenerationFailed(Exception):
    pass


def build_input_text(prospect: Prospect) -> str:
    return (
        f"A tailored value proposition deck for {prospect.company}. "
        f"Their {prospect.job_title} is interested in solving: {prospect.context}. "
        "Highlight relevant product capabilities and quantifiable outcomes for similar customers."
    )


def generate_deck(
    prospect: Prospect, submit: SubmitFn, poll: PollFn, sleep: SleepFn
) -> str:
    generation_id = submit(build_input_text(prospect))

    while True:
        result = poll(generation_id)
        status = result["status"]
        if status == "completed":
            return result["gammaUrl"]
        if status == "failed":
            raise GenerationFailed(f"Gamma generation {generation_id} failed")
        sleep(POLL_INTERVAL_S)
