from __future__ import annotations

from time import perf_counter
from typing import Protocol

from .evaluation import evaluate_facilities
from .models import Facility
from .schemas import TrajectoryMatchRequest


class FacilityEvaluator(Protocol):
    def evaluate(
        self, facilities: list[Facility], at_risk_population: int
    ) -> dict: ...


class FixtureFacilityEvaluator:
    def evaluate(self, facilities: list[Facility], at_risk_population: int) -> dict:
        return evaluate_facilities(facilities, at_risk_population)


class TrajectoryMatcher(Protocol):
    def match(
        self, payload: TrajectoryMatchRequest, candidates: list[dict]
    ) -> dict: ...


class FixtureTrajectoryMatcher:
    """Stable API stub. C replaces this service with the real pure algorithm."""

    def match(self, payload: TrajectoryMatchRequest, candidates: list[dict]) -> dict:
        started = perf_counter()
        filtered = [
            item
            for item in candidates
            if payload.filters.season_from <= item["season"] <= payload.filters.season_to
            and (
                not payload.filters.basins
                or item["basin"] in {basin.value for basin in payload.filters.basins}
            )
        ]
        filtered.sort(key=lambda item: item.get("impact_score") or 0, reverse=True)
        items = []
        for index, storm in enumerate(filtered[: payload.top_k], start=1):
            component = round(max(0.55, 0.94 - (index - 1) * 0.08), 3)
            items.append(
                {
                    "storm_id": storm["id"],
                    "rank": index,
                    "similarity": component,
                    "frechet_component": component,
                    "direction_component": component,
                    "explanation": "Fixture ranking for API/UI integration; C algorithm not connected.",
                }
            )
        return {
            "mode": payload.mode,
            "normalized_point_count": 64,
            "items": items,
            "elapsed_ms": round((perf_counter() - started) * 1000, 3),
            "data_status": "algorithmic_result",
            "source_ids": ["fixture-stub"],
        }
