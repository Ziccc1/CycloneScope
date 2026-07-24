from __future__ import annotations

from collections import defaultdict

from .models import Facility


def evaluate_facilities(facilities: list[Facility], at_risk_population: int) -> dict:
    """Return a transparent non-spatial fallback evaluation.

    The scenario endpoint currently receives only a total at-risk population,
    not population cells or a road network. It therefore must not pretend to
    calculate geographic coverage. The regional frontend analysis is the
    spatially-aware path; this endpoint reports capacity and budget totals so
    offline/API smoke tests remain useful.
    """
    grouped: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: {"facility_count": 0, "capacity_value": 0}
    )
    comparable_capacity = 0
    budget = 0

    for facility in facilities:
        capacity = max(0, int(facility.capacity_value or 0))
        unit = str(facility.capacity_unit or "unknown")
        key = (str(facility.type), unit)
        grouped[key]["facility_count"] += 1
        grouped[key]["capacity_value"] += capacity
        budget += int(facility.budget_points or 0)
        if facility.type == "shelter" and unit == "people":
            comparable_capacity += capacity

    covered = min(at_risk_population, comparable_capacity)
    by_type = [
        {
            "type": facility_type,
            "facility_count": values["facility_count"],
            "capacity_value": values["capacity_value"],
            "capacity_unit": capacity_unit,
            "modeled_reachable_population": (
                min(at_risk_population, values["capacity_value"])
                if facility_type == "shelter" and capacity_unit == "people"
                else 0
            ),
        }
        for (facility_type, capacity_unit), values in sorted(grouped.items())
    ]

    return {
        "facility_count": len(facilities),
        "at_risk_population": at_risk_population,
        "modeled_covered_population": covered,
        "modeled_uncovered_population": at_risk_population - covered,
        "modeled_coverage_ratio": round(covered / at_risk_population, 4),
        "total_budget_points": budget,
        "covered_population_per_budget_point": round(covered / budget, 2) if budget else None,
        "by_type": by_type,
        "assumptions": [
            "这是无人口栅格和道路网络输入时的容量回退结果，不代表空间覆盖。",
            "只有 capacity_unit=people 的避难所容量可以与人口相加；医疗、救援和物资不跨单位换算。",
            "设施位置与服务半径由区域分析路径计算；本接口仅汇总容量与相对预算点。",
            "budget_points 是课堂情景的相对成本点，不是货币或真实工程造价。",
        ],
    }
