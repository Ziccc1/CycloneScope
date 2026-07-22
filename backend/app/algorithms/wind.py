"""Wind-grid interpolation and particle stepping primitives."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WindFrame:
    width: int
    height: int
    west: float
    south: float
    resolution: float
    u: tuple[float | None, ...]
    v: tuple[float | None, ...]

    def __post_init__(self) -> None:
        if self.width < 2 or self.height < 2:
            raise ValueError("wind grid must be at least 2x2")
        if len(self.u) != self.width * self.height:
            raise ValueError("u length must equal width * height")
        if len(self.v) != self.width * self.height:
            raise ValueError("v length must equal width * height")


def _value(values: tuple[float | None, ...], width: int, row: int, column: int) -> float | None:
    return values[row * width + column]


def bilinear_vector(frame: WindFrame, lon: float, lat: float) -> tuple[float, float] | None:
    """Sample a north-to-south, west-to-east row-major wind grid."""
    x = (lon - frame.west) / frame.resolution
    y_from_south = (lat - frame.south) / frame.resolution
    if x < 0 or y_from_south < 0 or x > frame.width - 1 or y_from_south > frame.height - 1:
        return None
    column = min(int(x), frame.width - 2)
    south_row = min(int(y_from_south), frame.height - 2)
    # Row zero is the northern edge, unlike the mathematical y-axis.
    row = frame.height - 1 - south_row
    fx, fy = x - column, y_from_south - south_row
    corners = (
        (_value(frame.u, frame.width, row, column), _value(frame.v, frame.width, row, column)),
        (_value(frame.u, frame.width, row, column + 1), _value(frame.v, frame.width, row, column + 1)),
        (_value(frame.u, frame.width, row - 1, column), _value(frame.v, frame.width, row - 1, column)),
        (_value(frame.u, frame.width, row - 1, column + 1), _value(frame.v, frame.width, row - 1, column + 1)),
    )
    if any(u is None or v is None for u, v in corners):
        return None
    weights = ((1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy)
    return (
        sum((corner[0] or 0) * weight for corner, weight in zip(corners, weights)),
        sum((corner[1] or 0) * weight for corner, weight in zip(corners, weights)),
    )


def advect_particle(frame: WindFrame, lon: float, lat: float, seconds: float) -> tuple[float, float] | None:
    """Move a particle using one Euler step; wind components are m/s."""
    vector = bilinear_vector(frame, lon, lat)
    if vector is None:
        return None
    u, v = vector
    # Approximate local conversion from metres to degrees.
    meters_per_degree_lat = 111_320.0
    meters_per_degree_lon = max(1.0, meters_per_degree_lat * __import__("math").cos(__import__("math").radians(lat)))
    return lon + u * seconds / meters_per_degree_lon, lat + v * seconds / meters_per_degree_lat
