from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from .common import ContractMetadata, ContractModel, DataStatus
from .geojson import AreaGeometry


class ImpactGridProperties(ContractModel):
    cell_id: str = Field(min_length=1, max_length=120)
    time_start: datetime
    time_end: datetime
    hazard_index: float | None = Field(default=None, ge=0, le=1)
    max_wind_ms: float | None = Field(default=None, ge=0, le=150)
    precip_mm: float | None = Field(default=None, ge=0)
    population: int | None = Field(default=None, ge=0)
    exposed_population: int | None = Field(default=None, ge=0)
    reported_damage_usd: float | None = Field(default=None, ge=0)
    reported_damage_price_year: int | None = Field(default=None, ge=1900, le=2200)
    contributing_storm_ids: list[str] = Field(default_factory=list)
    data_status: DataStatus
    source_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def impact_values_are_consistent(self) -> "ImpactGridProperties":
        if self.time_end < self.time_start:
            raise ValueError("time_end must not be before time_start")
        if (
            self.population is not None
            and self.exposed_population is not None
            and self.exposed_population > self.population
        ):
            raise ValueError("exposed_population cannot exceed population")
        if (
            self.reported_damage_usd is not None
            and self.reported_damage_price_year is None
        ):
            raise ValueError("reported damage requires reported_damage_price_year")
        return self

    @field_validator("contributing_storm_ids", "source_ids")
    @classmethod
    def ids_are_unique(cls, values: list[str]) -> list[str]:
        if len(values) != len(set(values)):
            raise ValueError("identifier lists must not contain duplicates")
        return values


class ImpactGridFeature(ContractModel):
    type: Literal["Feature"] = "Feature"
    id: str | None = None
    geometry: AreaGeometry
    properties: ImpactGridProperties


class ImpactGridCollection(ContractMetadata):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[ImpactGridFeature]
    metric: Literal[
        "hazard_index",
        "max_wind_ms",
        "precip_mm",
        "population",
        "exposed_population",
        "reported_damage_usd",
    ]
