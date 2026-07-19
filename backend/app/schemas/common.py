from __future__ import annotations

import math
from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


SCHEMA_VERSION = "1.0"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ContractModel(BaseModel):
    """Strict base for all data exchanged between A, B and C."""

    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        validate_assignment=True,
        validate_default=True,
        allow_inf_nan=False,
    )


class DataStatus(str, Enum):
    OBSERVED = "observed"
    REANALYSIS = "reanalysis"
    REPORTED = "reported"
    MODELED = "modeled"
    MIXED = "mixed"
    SYNTHETIC_FIXTURE = "synthetic_fixture"
    SYNTHETIC_DEMO = "synthetic_demo"
    ALGORITHMIC_RESULT = "algorithmic_result"
    SCENARIO_MODEL = "scenario_model"


class Basin(str, Enum):
    NORTH_ATLANTIC = "NA"
    SOUTH_ATLANTIC = "SA"
    WESTERN_NORTH_PACIFIC = "WP"
    EASTERN_NORTH_PACIFIC = "EP"
    NORTH_INDIAN = "NI"
    SOUTH_INDIAN = "SI"
    SOUTH_PACIFIC = "SP"
    AUSTRALIAN = "AU"
    UNKNOWN = "XX"


class ContractMetadata(ContractModel):
    schema_version: Literal["1.0"] = SCHEMA_VERSION
    data_status: DataStatus
    source_ids: list[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=utc_now)

    @field_validator("source_ids")
    @classmethod
    def unique_source_ids(cls, values: list[str]) -> list[str]:
        if any(not value for value in values):
            raise ValueError("source_ids cannot contain empty identifiers")
        if len(values) != len(set(values)):
            raise ValueError("source_ids must be unique")
        return values

    @model_validator(mode="after")
    def provenance_is_present_for_real_data(self) -> "ContractMetadata":
        statuses_requiring_sources = {
            DataStatus.OBSERVED,
            DataStatus.REANALYSIS,
            DataStatus.REPORTED,
            DataStatus.MODELED,
            DataStatus.MIXED,
        }
        if self.data_status in statuses_requiring_sources and not self.source_ids:
            raise ValueError(f"{self.data_status} data requires at least one source_id")
        return self


class GeoPoint(ContractModel):
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)

    @model_validator(mode="after")
    def coordinates_are_finite(self) -> "GeoPoint":
        if not math.isfinite(self.lon) or not math.isfinite(self.lat):
            raise ValueError("coordinates must be finite")
        return self


class GeoBounds(ContractModel):
    west: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    north: float = Field(ge=-90, le=90)
    crosses_antimeridian: bool = False

    @model_validator(mode="after")
    def bounds_are_consistent(self) -> "GeoBounds":
        if self.south >= self.north:
            raise ValueError("south must be smaller than north")
        if self.crosses_antimeridian:
            if self.west <= self.east:
                raise ValueError(
                    "antimeridian-crossing bounds must have west greater than east"
                )
        elif self.west >= self.east:
            raise ValueError("west must be smaller than east")
        return self


class TimeWindow(ContractModel):
    start: datetime
    end: datetime

    @model_validator(mode="after")
    def end_is_not_before_start(self) -> "TimeWindow":
        if self.end < self.start:
            raise ValueError("end must not be before start")
        return self


class HealthResponse(ContractModel):
    status: Literal["ok"]
    service: Literal["cyclonescope-api"]
    version: str
    database: Literal["sqlite"]
    sample_data: bool
    data_mode: Literal["fixture", "processed"]
    data_status: DataStatus
