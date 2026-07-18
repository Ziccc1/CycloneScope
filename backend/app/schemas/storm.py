from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from .common import Basin, ContractMetadata, ContractModel, DataStatus, utc_now


class StormSummary(ContractModel):
    id: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=100)
    season: int = Field(ge=1840, le=2200)
    basin: Basin
    start_time: datetime
    end_time: datetime
    max_wind_ms: float | None = Field(default=None, ge=0, le=150)
    min_pressure_hpa: float | None = Field(default=None, ge=800, le=1100)
    duration_hours: float = Field(ge=0)
    ace: float | None = Field(default=None, ge=0)
    landfall_count: int = Field(default=0, ge=0)
    classic: bool = False
    classic_rank: int | None = Field(default=None, ge=1)
    impact_score: float | None = Field(default=None, ge=0, le=100)
    score_coverage: float = Field(default=0, ge=0, le=1)
    reported_deaths: int | None = Field(default=None, ge=0)
    reported_damage_usd_2024: float | None = Field(default=None, ge=0)
    wind_available: bool = False
    impact_available: bool = False
    data_status: DataStatus
    source_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def storm_fields_are_consistent(self) -> "StormSummary":
        if self.end_time < self.start_time:
            raise ValueError("end_time must not be before start_time")
        if self.classic and self.classic_rank is None:
            raise ValueError("classic storms require classic_rank")
        if not self.classic and self.classic_rank is not None:
            raise ValueError("non-classic storms cannot have classic_rank")
        if self.impact_score is None and self.score_coverage != 0:
            raise ValueError("score_coverage must be 0 when impact_score is null")
        if self.impact_score is not None and self.score_coverage == 0:
            raise ValueError("a non-null impact_score requires positive score_coverage")
        expected_duration = (self.end_time - self.start_time).total_seconds() / 3600
        if abs(self.duration_hours - expected_duration) > 0.01:
            raise ValueError("duration_hours must equal end_time - start_time")
        real_statuses = {
            DataStatus.OBSERVED,
            DataStatus.REANALYSIS,
            DataStatus.REPORTED,
            DataStatus.MODELED,
            DataStatus.MIXED,
        }
        if self.data_status in real_statuses and not self.source_ids:
            raise ValueError(f"{self.data_status} storms require at least one source_id")
        return self

    @field_validator("source_ids")
    @classmethod
    def summary_source_ids_are_unique(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("source_ids must be unique")
        return values


class StormCatalogResponse(ContractMetadata):
    items: list[StormSummary]
    count: int = Field(ge=0)

    @model_validator(mode="after")
    def count_matches_items(self) -> "StormCatalogResponse":
        if self.count != len(self.items):
            raise ValueError("count must equal the number of items")
        if len({item.id for item in self.items}) != len(self.items):
            raise ValueError("storm ids must be unique")
        classic_ranks = [
            item.classic_rank for item in self.items if item.classic_rank is not None
        ]
        if len(classic_ranks) != len(set(classic_ranks)):
            raise ValueError("classic_rank values must be unique")
        return self


class TrackPoint(ContractModel):
    time: datetime
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    wind_ms: float | None = Field(default=None, ge=0, le=150)
    pressure_hpa: float | None = Field(default=None, ge=800, le=1100)
    category: str | None = Field(default=None, max_length=20)
    storm_status: str | None = Field(default=None, max_length=40)
    moving_speed_kmh: float | None = Field(default=None, ge=0, le=400)
    is_landfall: bool | None = None
    source_agency: str | None = Field(default=None, max_length=80)


class StormTrackResponse(ContractMetadata):
    storm_id: str = Field(min_length=1, max_length=40)
    points: list[TrackPoint] = Field(min_length=1)

    @field_validator("points")
    @classmethod
    def points_are_strictly_ordered(cls, points: list[TrackPoint]) -> list[TrackPoint]:
        times = [point.time for point in points]
        if times != sorted(times):
            raise ValueError("track points must be ordered by time")
        if len(times) != len(set(times)):
            raise ValueError("track point times must be unique")
        return points


class StormImpact(ContractModel):
    estimated_exposed_population: int | None = Field(default=None, ge=0)
    wind_footprint_area_km2: float | None = Field(default=None, ge=0)
    reported_deaths: int | None = Field(default=None, ge=0)
    reported_affected_population: int | None = Field(default=None, ge=0)
    reported_damage_usd_2024: float | None = Field(default=None, ge=0)
    warning: str | None = Field(default=None, max_length=500)


class StormImpactResponse(ContractMetadata):
    storm_id: str = Field(min_length=1, max_length=40)
    estimated_exposed_population: int | None = Field(default=None, ge=0)
    wind_footprint_area_km2: float | None = Field(default=None, ge=0)
    reported_deaths: int | None = Field(default=None, ge=0)
    reported_affected_population: int | None = Field(default=None, ge=0)
    reported_damage_usd_2024: float | None = Field(default=None, ge=0)
    warning: str | None = Field(default=None, max_length=500)


class StormDetail(StormSummary):
    schema_version: Literal["1.0"] = "1.0"
    generated_at: datetime = Field(default_factory=utc_now)
    track: list[TrackPoint] = Field(min_length=1)
    impact: StormImpact

    @field_validator("track")
    @classmethod
    def detail_track_is_ordered(cls, points: list[TrackPoint]) -> list[TrackPoint]:
        times = [point.time for point in points]
        if times != sorted(times) or len(times) != len(set(times)):
            raise ValueError("detail track points must be unique and ordered")
        return points

    @model_validator(mode="after")
    def track_is_inside_lifecycle(self) -> "StormDetail":
        if self.track[0].time < self.start_time or self.track[-1].time > self.end_time:
            raise ValueError("track times must fall inside the storm lifecycle")
        return self
