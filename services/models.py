"""Shared data models for the prospect call -> booking -> deck -> handoff pipeline."""

import datetime

import pydantic


class Prospect(pydantic.BaseModel):
    name: str
    company: str
    job_title: str
    context: str
    email: str
    phone: str
    coordinates: dict | None = None


class BookingResult(pydantic.BaseModel):
    event_link: str
    start_time: datetime.datetime
