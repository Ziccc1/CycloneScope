"""Deterministic trajectory preprocessing and shape matching primitives."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class TrackPoint:
    lon: float
    lat: float


def _distance(a: TrackPoint, b: TrackPoint) -> float:
    return math.hypot(b.lon - a.lon, b.lat - a.lat)


def resample_track(points: list[TrackPoint], count: int = 64) -> list[TrackPoint]:
    """Resample a polyline at equal cumulative-distance intervals."""
    if count < 2:
        raise ValueError("count must be at least 2")
    if len(points) < 2:
        raise ValueError("at least two track points are required")
    lengths = [0.0]
    for left, right in zip(points, points[1:]):
        lengths.append(lengths[-1] + _distance(left, right))
    total = lengths[-1]
    if total == 0:
        return [points[0]] * count
    result: list[TrackPoint] = []
    segment = 0
    for index in range(count):
        target = total * index / (count - 1)
        while segment < len(points) - 2 and lengths[segment + 1] < target:
            segment += 1
        start, end = points[segment], points[segment + 1]
        span = lengths[segment + 1] - lengths[segment]
        fraction = 0.0 if span == 0 else (target - lengths[segment]) / span
        result.append(
            TrackPoint(
                lon=start.lon + (end.lon - start.lon) * fraction,
                lat=start.lat + (end.lat - start.lat) * fraction,
            )
        )
    return result


def normalize_shape(points: list[TrackPoint]) -> list[TrackPoint]:
    """Translate, rotate, and scale a track for shape-only comparison."""
    if len(points) < 2:
        raise ValueError("at least two track points are required")
    origin = points[0]
    translated = [(p.lon - origin.lon, p.lat - origin.lat) for p in points]
    end_x, end_y = translated[-1]
    angle = math.atan2(end_y, end_x)
    cosine, sine = math.cos(-angle), math.sin(-angle)
    rotated = [
        (x * cosine - y * sine, x * sine + y * cosine) for x, y in translated
    ]
    scale = max(math.hypot(x, y) for x, y in rotated)
    if scale == 0:
        return [TrackPoint(0.0, 0.0) for _ in rotated]
    return [TrackPoint(x / scale, y / scale) for x, y in rotated]


def trajectory_distance(left: list[TrackPoint], right: list[TrackPoint]) -> float:
    """Return mean pointwise distance for equally sampled normalized tracks."""
    if len(left) != len(right) or not left:
        raise ValueError("tracks must be non-empty and have equal length")
    return sum(_distance(a, b) for a, b in zip(left, right)) / len(left)
