from __future__ import annotations

import json
import math
from functools import cached_property
from pathlib import Path
from time import perf_counter
from typing import Protocol

from .evaluation import evaluate_facilities
from .algorithms.trajectory import TrackPoint, normalize_shape, resample_track
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
<<<<<<< HEAD
=======
                    "geographic_component": component,
                    "shape_component": component,
>>>>>>> origin/main
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


class ProcessedTrajectoryMatcher:
    """Match user polylines against A7's validated 64-point features."""

    def __init__(self, feature_path: Path):
        self.feature_path = feature_path

    @cached_property
    def features(self) -> dict[str, dict]:
        if not self.feature_path.exists():
            raise FileNotFoundError(f"Track features not found: {self.feature_path}")
        payload = json.loads(self.feature_path.read_text(encoding="utf-8"))
        return {str(item["storm_id"]): item for item in payload}

    @staticmethod
    def _distance(left: TrackPoint, right: TrackPoint) -> float:
        return math.hypot(left.lon - right.lon, left.lat - right.lat)

    @classmethod
    def _frechet(cls, left: list[TrackPoint], right: list[TrackPoint]) -> float:
        cache = [[0.0] * len(right) for _ in left]
        for i, lpoint in enumerate(left):
            for j, rpoint in enumerate(right):
                distance = cls._distance(lpoint, rpoint)
                if i == 0 and j == 0:
                    cache[i][j] = distance
                elif i == 0:
                    cache[i][j] = max(cache[i][j - 1], distance)
                elif j == 0:
                    cache[i][j] = max(cache[i - 1][j], distance)
                else:
                    cache[i][j] = max(
                        min(cache[i - 1][j], cache[i - 1][j - 1], cache[i][j - 1]),
                        distance,
                    )
        return cache[-1][-1]

    @staticmethod
    def _direction_component(left: list[TrackPoint], right: list[TrackPoint]) -> float:
        def angle(points: list[TrackPoint]) -> float:
            start, end = points[0], points[-1]
            mean_lat = math.radians((start.lat + end.lat) / 2)
            return math.atan2(end.lat - start.lat, (end.lon - start.lon) * math.cos(mean_lat))

        return (math.cos(angle(left) - angle(right)) + 1) / 2

    def match(self, payload: TrajectoryMatchRequest, candidates: list[dict]) -> dict:
        started = perf_counter()
        query_geo = resample_track(
            [TrackPoint(point.lon, point.lat) for point in payload.points], 64
        )
        query_shape = normalize_shape(query_geo)
        allowed = {
            item["id"]: item
            for item in candidates
            if payload.filters.season_from <= item["season"] <= payload.filters.season_to
            and (
                not payload.filters.basins
                or item["basin"] in {basin.value for basin in payload.filters.basins}
            )
        }
        prepared = []
        for storm_id, storm in allowed.items():
            feature = self.features.get(storm_id)
            if not feature:
                continue
            candidate_geo = [TrackPoint(float(x), float(y)) for x, y in feature["points"]]
            candidate_shape = [
                TrackPoint(float(x), float(y)) for x, y in feature["shape_normalized"]
            ]
            left = query_shape if payload.mode.value == "shape" else query_geo
            right = candidate_shape if payload.mode.value == "shape" else candidate_geo
            prefilter = sum(self._distance(a, b) for a, b in zip(left, right)) / 64
<<<<<<< HEAD
            prepared.append((prefilter, storm_id, storm, candidate_geo, right))

        shortlist = sorted(prepared, key=lambda item: item[0])[: max(40, payload.top_k * 8)]
        ranked = []
        for _, storm_id, storm, candidate_geo, comparison in shortlist:
            query = query_shape if payload.mode.value == "shape" else query_geo
            distance = self._frechet(query, comparison)
            scale = 2.5 if payload.mode.value == "shape" else 0.08
            frechet_component = math.exp(-scale * distance)
            direction_component = self._direction_component(query_geo, candidate_geo)
            similarity = 0.6 * frechet_component + 0.4 * direction_component
            ranked.append((similarity, storm_id, storm, frechet_component, direction_component))

        ranked.sort(reverse=True, key=lambda item: item[0])
        items = []
        for index, (similarity, storm_id, storm, frechet, direction) in enumerate(
=======
            prepared.append(
                (prefilter, storm_id, storm, candidate_geo, candidate_shape)
            )

        shortlist = sorted(prepared, key=lambda item: item[0])[: max(40, payload.top_k * 8)]
        ranked = []
        for _, storm_id, storm, candidate_geo, candidate_shape in shortlist:
            geographic_distance = self._frechet(query_geo, candidate_geo)
            shape_distance = self._frechet(query_shape, candidate_shape)
            geographic_component = math.exp(-0.08 * geographic_distance)
            shape_component = math.exp(-2.5 * shape_distance)
            frechet_component = (
                shape_component
                if payload.mode.value == "shape"
                else geographic_component
            )
            direction_component = self._direction_component(query_geo, candidate_geo)
            similarity = 0.6 * frechet_component + 0.4 * direction_component
            ranked.append(
                (
                    similarity,
                    storm_id,
                    storm,
                    frechet_component,
                    geographic_component,
                    shape_component,
                    direction_component,
                )
            )

        ranked.sort(reverse=True, key=lambda item: item[0])
        items = []
        for index, (
            similarity,
            storm_id,
            storm,
            frechet,
            geographic,
            shape,
            direction,
        ) in enumerate(
>>>>>>> origin/main
            ranked[: payload.top_k], start=1
        ):
            items.append(
                {
                    "storm_id": storm_id,
                    "rank": index,
                    "similarity": round(similarity, 4),
                    "frechet_component": round(frechet, 4),
<<<<<<< HEAD
=======
                    "geographic_component": round(geographic, 4),
                    "shape_component": round(shape, 4),
>>>>>>> origin/main
                    "direction_component": round(direction, 4),
                    "explanation": f"A7 64点特征匹配：{storm['name']}（{storm['season']}，{storm['basin']}）。",
                }
            )
        return {
            "mode": payload.mode,
            "normalized_point_count": 64,
            "items": items,
            "elapsed_ms": round((perf_counter() - started) * 1000, 3),
            "data_status": "algorithmic_result",
            "source_ids": ["ibtracs_since1980", "a7_track_features"],
        }
