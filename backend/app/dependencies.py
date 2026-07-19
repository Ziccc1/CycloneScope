from __future__ import annotations

from collections.abc import Generator

from fastapi import Request
from sqlalchemy.orm import Session

from .repository import DataRepository
from .services import FacilityEvaluator, TrajectoryMatcher


def get_db(request: Request) -> Generator[Session, None, None]:
    db = request.app.state.session_factory()
    try:
        yield db
    finally:
        db.close()


def get_repository(request: Request) -> DataRepository:
    return request.app.state.repository


def get_facility_evaluator(request: Request) -> FacilityEvaluator:
    return request.app.state.facility_evaluator


def get_trajectory_matcher(request: Request) -> TrajectoryMatcher:
    return request.app.state.trajectory_matcher
