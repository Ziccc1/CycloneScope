"""Facility service-radius and capacity allocation primitives."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Facility:
    id: str
    lon: float
    lat: float
    capacity: float | None
    service_radius_km: float


@dataclass(frozen=True)
class FacilityCoverage:
    facility_id: str
    covered_population: float
    allocated_population: float


def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    radius = 6371.0088
    lat_a, lat_b = math.radians(lat1), math.radians(lat2)
    delta_lat = lat_b - lat_a
    delta_lon = math.radians(lon2 - lon1)
    value = math.sin(delta_lat / 2) ** 2 + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lon / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(value))


def allocate_population(
    facilities: list[Facility], population_cells: list[tuple[float, float, float]]
) -> list[FacilityCoverage]:
    """Assign each population cell to its nearest eligible facility once."""
    allocated = {facility.id: 0.0 for facility in facilities}
    covered = {facility.id: 0.0 for facility in facilities}
    remaining = {facility.id: facility.capacity for facility in facilities}
    for lon, lat, population in population_cells:
        candidates = sorted(
            (
                haversine_km(lon, lat, facility.lon, facility.lat),
                facility,
            )
            for facility in facilities
            if haversine_km(lon, lat, facility.lon, facility.lat) <= facility.service_radius_km
        )
        if not candidates:
            continue
        distance, facility = candidates[0]
        del distance
        covered[facility.id] += population
        capacity = remaining[facility.id]
        assignable = population if capacity is None else min(population, max(0.0, capacity))
        allocated[facility.id] += assignable
        if capacity is not None:
            remaining[facility.id] = capacity - assignable
    return [
        FacilityCoverage(facility.id, covered[facility.id], allocated[facility.id])
        for facility in facilities
    ]
