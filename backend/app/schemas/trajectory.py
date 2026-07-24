from __future__ import annotations

from enum import Enum

from typing import Literal

from pydantic import Field, field_validator, model_validator

from .common import Basin, ContractMetadata, ContractModel, GeoPoint


class TrajectoryMatchMode(str, Enum):
    GEOGRAPHIC = "geographic"
    SHAPE = "shape"


class TrajectoryFilters(ContractModel):
    basins: list[Basin] = Field(default_factory=list)
    season_from: int = Field(default=1840, ge=1840, le=2200)
    season_to: int = Field(default=2200, ge=1840, le=2200)

    @model_validator(mode="after")
    def season_range_is_valid(self) -> "TrajectoryFilters":
        if self.season_to < self.season_from:
            raise ValueError("season_to must not be before season_from")
        if len(self.basins) != len(set(self.basins)):
            raise ValueError("basins must be unique")
        return self


class TrajectoryMatchRequest(ContractModel):
    mode: TrajectoryMatchMode
    points: list[GeoPoint] = Field(min_length=2, max_length=512)
    filters: TrajectoryFilters = Field(default_factory=TrajectoryFilters)
    top_k: int = Field(default=5, ge=1, le=20)

    @field_validator("points")
    @classmethod
    def query_has_distinct_points(cls, points: list[GeoPoint]) -> list[GeoPoint]:
        if len({(point.lon, point.lat) for point in points}) < 2:
            raise ValueError("trajectory requires at least two distinct points")
        return points


class NormalizedPoint(ContractModel):
    x: float = Field(ge=-2, le=2)
    y: float = Field(ge=-2, le=2)


class TrackFeature(ContractModel):
    storm_id: str = Field(min_length=1, max_length=40)
    basin: Basin
    season: int = Field(ge=1840, le=2200)
    geographic_points: list[GeoPoint] = Field(min_length=64, max_length=64)
    normalized_points: list[NormalizedPoint] = Field(min_length=64, max_length=64)


class TrajectoryMatch(ContractModel):
    storm_id: str = Field(min_length=1, max_length=40)
    rank: int = Field(ge=1)
    similarity: float = Field(ge=0, le=1)
    frechet_component: float = Field(ge=0, le=1)
    geographic_component: float = Field(ge=0, le=1)
    shape_component: float = Field(ge=0, le=1)
    direction_component: float = Field(ge=0, le=1)
    explanation: str = Field(min_length=1, max_length=300)

    @model_validator(mode="after")
    def total_matches_documented_weights(self) -> "TrajectoryMatch":
        expected = 0.6 * self.frechet_component + 0.4 * self.direction_component
        if abs(self.similarity - expected) > 0.001:
            raise ValueError(
                "similarity must equal 0.6 * frechet_component + 0.4 * direction_component"
            )
        return self


class TrajectoryMatchResponse(ContractMetadata):
    data_status: Literal["algorithmic_result"] = "algorithmic_result"
    mode: TrajectoryMatchMode
    normalized_point_count: int = Field(default=64, ge=2, le=512)
    items: list[TrajectoryMatch]
    elapsed_ms: float = Field(ge=0)

    @field_validator("items")
    @classmethod
    def ranks_are_contiguous(cls, items: list[TrajectoryMatch]) -> list[TrajectoryMatch]:
        ranks = [item.rank for item in items]
        if ranks != list(range(1, len(items) + 1)):
            raise ValueError("match ranks must start at 1 and be contiguous")
        if len({item.storm_id for item in items}) != len(items):
            raise ValueError("match storm_ids must be unique")
        return items
