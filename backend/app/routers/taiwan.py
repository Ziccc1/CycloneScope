from __future__ import annotations

from fastapi import APIRouter, Depends

from ..dependencies import get_repository
from ..query import geometry_intersects_bounds, parse_bbox, point_in_bounds
from ..repository import DataRepository
from ..schemas import FacilityCollection, FacilityType, TaiwanZoneCollection


router = APIRouter()


@router.get("/api/taiwan/zones", response_model=TaiwanZoneCollection, tags=["taiwan"])
def taiwan_zones(
    county_code: str | None = None,
    bbox: str | None = None,
    repository: DataRepository = Depends(get_repository),
):
    payload = repository.get_taiwan_zones()
    bounds = parse_bbox(bbox)
    features = [
        feature
        for feature in payload["features"]
        if (
            county_code is None
            or feature["properties"]["county_code"] == county_code
        )
        and geometry_intersects_bounds(feature["geometry"]["coordinates"], bounds)
    ]
    return {**payload, "features": features}


@router.get(
    "/api/taiwan/facilities",
    response_model=FacilityCollection,
    tags=["taiwan"],
)
def taiwan_facilities(
    type: FacilityType | None = None,
    county_code: str | None = None,
    bbox: str | None = None,
    repository: DataRepository = Depends(get_repository),
):
    payload = repository.get_taiwan_facilities()
    bounds = parse_bbox(bbox)
    features = [
        feature
        for feature in payload["features"]
        if (type is None or feature["properties"]["type"] == type.value)
        and (
            county_code is None
            or feature["properties"].get("county_code") == county_code
        )
        and point_in_bounds(
            feature["geometry"]["coordinates"][0],
            feature["geometry"]["coordinates"][1],
            bounds,
        )
    ]
    return {**payload, "features": features}
