from __future__ import annotations

from .models import Facility


def evaluate_facilities(facilities: list[Facility], at_risk_population: int) -> dict:
    # MVP calculation only. The final version will replace this with spatial
    # intersection, road accessibility, population rasters and capacity by type.
    comparable_capacity = sum(
        facility.capacity_value
        for facility in facilities
        if facility.type == "shelter" and facility.capacity_unit == "people"
    )
    covered = min(at_risk_population, comparable_capacity)
    budget = sum(facility.budget_points for facility in facilities)

    return {
        "facility_count": len(facilities),
        "at_risk_population": at_risk_population,
        "modeled_covered_population": covered,
        "modeled_uncovered_population": at_risk_population - covered,
        "modeled_coverage_ratio": round(covered / at_risk_population, 4),
        "total_budget_points": budget,
        "covered_population_per_budget_point": round(covered / budget, 2) if budget else None,
        "assumptions": [
            "当前测试版本只将 capacity_unit=people 的模拟避难所计入覆盖人口。",
            "预算点是相对情景参数，不是实际工程造价。",
            "尚未接入人口栅格、道路可达性或设施服务区空间相交。",
        ],
    }
