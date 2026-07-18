from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field, model_validator

from .common import ContractModel
from .taiwan import CapacityUnit, EXPECTED_CAPACITY_UNITS, FacilityType


DEFAULT_FACILITY_VALUES: dict[FacilityType, tuple[int, CapacityUnit, float, int]] = {
    FacilityType.SHELTER: (500, CapacityUnit.PEOPLE, 5.0, 3),
    FacilityType.MEDICAL: (50, CapacityUnit.BEDS, 15.0, 5),
    FacilityType.RESCUE: (5, CapacityUnit.TEAMS, 20.0, 4),
    FacilityType.WAREHOUSE: (5000, CapacityUnit.PEOPLE_DAY, 30.0, 4),
}


class ScenarioCreate(ContractModel):
    name: str = Field(min_length=1, max_length=120)


class ScenarioRead(ContractModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime


class FacilityCreate(ContractModel):
    type: FacilityType
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    capacity_value: int | None = Field(default=None, ge=0)
    capacity_unit: CapacityUnit | None = None
    service_radius_km: float | None = Field(default=None, gt=0, le=200)
    budget_points: int | None = Field(default=None, ge=1, le=5)

    @model_validator(mode="after")
    def apply_and_validate_type_defaults(self) -> "FacilityCreate":
        default_capacity, default_unit, default_radius, default_budget = (
            DEFAULT_FACILITY_VALUES[self.type]
        )
        if self.capacity_value is None:
            object.__setattr__(self, "capacity_value", default_capacity)
        if self.capacity_unit is None:
            object.__setattr__(self, "capacity_unit", default_unit)
        if self.service_radius_km is None:
            object.__setattr__(self, "service_radius_km", default_radius)
        if self.budget_points is None:
            object.__setattr__(self, "budget_points", default_budget)
        expected = EXPECTED_CAPACITY_UNITS[self.type]
        if self.capacity_unit != expected:
            raise ValueError(f"{self.type} capacity must use {expected}")
        return self


class FacilityRead(FacilityCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scenario_id: str
    is_simulated: bool


class EvaluationRequest(ContractModel):
    at_risk_population: int = Field(default=100_000, gt=0)
    hazard_threshold: float = Field(default=0.5, ge=0, le=1)


class FacilityTypeEvaluation(ContractModel):
    type: FacilityType
    facility_count: int = Field(ge=0)
    capacity_value: int = Field(ge=0)
    capacity_unit: CapacityUnit
    modeled_reachable_population: int = Field(ge=0)


class EvaluationResponse(ContractModel):
    scenario_id: str
    facility_count: int = Field(ge=0)
    at_risk_population: int = Field(gt=0)
    modeled_covered_population: int = Field(ge=0)
    modeled_uncovered_population: int = Field(ge=0)
    modeled_coverage_ratio: float = Field(ge=0, le=1)
    total_budget_points: int = Field(ge=0)
    covered_population_per_budget_point: float | None = Field(default=None, ge=0)
    by_type: list[FacilityTypeEvaluation] = Field(default_factory=list)
    data_status: Literal["scenario_model"] = "scenario_model"
    assumptions: list[str]

    @model_validator(mode="after")
    def totals_are_consistent(self) -> "EvaluationResponse":
        if (
            self.modeled_covered_population + self.modeled_uncovered_population
            != self.at_risk_population
        ):
            raise ValueError("covered and uncovered populations must sum to at_risk_population")
        expected_ratio = self.modeled_covered_population / self.at_risk_population
        if abs(self.modeled_coverage_ratio - expected_ratio) > 0.0001:
            raise ValueError("modeled_coverage_ratio is inconsistent with population totals")
        return self
