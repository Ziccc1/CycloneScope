from __future__ import annotations

import math
from typing import Annotated, Literal

from pydantic import Field, field_validator

from .common import ContractModel


Position = tuple[float, float]


def validate_position(position: Position) -> None:
    lon, lat = position
    if not math.isfinite(lon) or not math.isfinite(lat):
        raise ValueError("GeoJSON coordinates must be finite")
    if not -180 <= lon <= 180 or not -90 <= lat <= 90:
        raise ValueError("GeoJSON coordinates are outside WGS84 bounds")


def validate_ring(ring: list[Position]) -> None:
    if len(ring) < 4:
        raise ValueError("polygon rings require at least four positions")
    for position in ring:
        validate_position(position)
    if ring[0] != ring[-1]:
        raise ValueError("polygon rings must be closed")


class PointGeometry(ContractModel):
    type: Literal["Point"] = "Point"
    coordinates: Position

    @field_validator("coordinates")
    @classmethod
    def point_is_valid(cls, position: Position) -> Position:
        validate_position(position)
        return position


class PolygonGeometry(ContractModel):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[Position]] = Field(min_length=1)

    @field_validator("coordinates")
    @classmethod
    def rings_are_valid(cls, rings: list[list[Position]]) -> list[list[Position]]:
        for ring in rings:
            validate_ring(ring)
        return rings


class MultiPolygonGeometry(ContractModel):
    type: Literal["MultiPolygon"] = "MultiPolygon"
    coordinates: list[list[list[Position]]] = Field(min_length=1)

    @field_validator("coordinates")
    @classmethod
    def polygons_are_valid(
        cls, polygons: list[list[list[Position]]]
    ) -> list[list[list[Position]]]:
        for polygon in polygons:
            if not polygon:
                raise ValueError("multipolygon members require at least one ring")
            for ring in polygon:
                validate_ring(ring)
        return polygons


AreaGeometry = Annotated[
    PolygonGeometry | MultiPolygonGeometry, Field(discriminator="type")
]
