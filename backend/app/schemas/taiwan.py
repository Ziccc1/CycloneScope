from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import Field, model_validator

from .common import ContractMetadata, ContractModel, DataStatus
from .geojson import AreaGeometry, PointGeometry


class FacilityType(str, Enum):
    SHELTER = "shelter"
    MEDICAL = "medical"
    RESCUE = "rescue"
    WAREHOUSE = "warehouse"


class CapacityUnit(str, Enum):
    PEOPLE = "people"
    BEDS = "beds"
    TEAMS = "teams"
    PEOPLE_DAY = "people_day"


EXPECTED_CAPACITY_UNITS: dict[FacilityType, CapacityUnit] = {
    FacilityType.SHELTER: CapacityUnit.PEOPLE,
    FacilityType.MEDICAL: CapacityUnit.BEDS,
    FacilityType.RESCUE: CapacityUnit.TEAMS,
    FacilityType.WAREHOUSE: CapacityUnit.PEOPLE_DAY,
}


class TaiwanZoneProperties(ContractModel):
    zone_id: str = Field(min_length=1, max_length=120)
    county_code: str = Field(min_length=1, max_length=20)
    town_code: str | None = Field(default=None, max_length=20)
    name_zh: str = Field(min_length=1, max_length=160)
    population: int | None = Field(default=None, ge=0)
    population_year: int | None = Field(default=None, ge=1900, le=2200)
    area_km2: float = Field(gt=0)
    centroid_lon: float = Field(ge=118, le=123)
    centroid_lat: float = Field(ge=21, le=27)
    source_ids: list[str] = Field(default_factory=list)
    data_status: DataStatus


class TaiwanZoneFeature(ContractModel):
    type: Literal["Feature"] = "Feature"
    id: str | None = None
    geometry: AreaGeometry
    properties: TaiwanZoneProperties


class TaiwanZoneCollection(ContractMetadata):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[TaiwanZoneFeature]


class FacilityProperties(ContractModel):
    facility_id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    type: FacilityType
    capacity_value: int | None = Field(default=None, ge=0)
    capacity_unit: CapacityUnit | None = None
    service_radius_km: float = Field(gt=0, le=200)
    budget_points: int | None = Field(default=None, ge=1, le=5)
    address: str | None = Field(default=None, max_length=300)
    county_code: str | None = Field(default=None, max_length=20)
    is_simulated: bool = False
    source_ids: list[str] = Field(default_factory=list)
    data_status: DataStatus

    @model_validator(mode="after")
    def facility_fields_are_consistent(self) -> "FacilityProperties":
        if (self.capacity_value is None) != (self.capacity_unit is None):
            raise ValueError("capacity_value and capacity_unit must be supplied together")
        if self.capacity_unit is not None:
            expected = EXPECTED_CAPACITY_UNITS[self.type]
            if self.capacity_unit != expected:
                raise ValueError(f"{self.type} capacity must use {expected}")
        if self.is_simulated and self.budget_points is None:
            raise ValueError("simulated facilities require budget_points")
        if not self.is_simulated and self.budget_points is not None:
            raise ValueError("observed facilities cannot have scenario budget_points")
        return self


class FacilityFeature(ContractModel):
    type: Literal["Feature"] = "Feature"
    id: str | None = None
    geometry: PointGeometry
    properties: FacilityProperties


class FacilityCollection(ContractMetadata):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[FacilityFeature]
