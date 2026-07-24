from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..dependencies import get_repository
from ..query import geometry_intersects_bounds, parse_bbox, point_in_bounds
from ..repository import DataAssetNotFound, DataRepository
from ..schemas import (
    FacilityCollection,
    FacilityServiceAreaResponse,
    FacilityType,
    TaiwanZoneCollection,
)


router = APIRouter()


@router.get("/api/taiwan/zones", response_model=TaiwanZoneCollection, tags=["taiwan"])
def taiwan_zones(
    county_code: str | None = None,
    bbox: str | None = None,
    repository: DataRepository = Depends(get_repository),
):
    try:
        payload = repository.get_taiwan_zones()
    except DataAssetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
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
    try:
        payload = repository.get_taiwan_facilities()
    except DataAssetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
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


@router.get(
    "/api/taiwan/facilities/{facility_id}/service-area",
    response_model=FacilityServiceAreaResponse,
    tags=["taiwan"],
)
def facility_service_area(
    facility_id: str,
    repository: DataRepository = Depends(get_repository),
):
    try:
        return repository.get_facility_service_area(facility_id)
    except DataAssetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
