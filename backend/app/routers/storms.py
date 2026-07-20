from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from ..dependencies import get_repository
from ..repository import DataAssetNotFound, DataRepository
from ..schemas import (
    GeoBounds,
    StormCatalogResponse,
    StormDetail,
    StormImpactResponse,
    StormTrackResponse,
    WindFrame,
    WindManifest,
)


router = APIRouter()


def _storm_or_404(repository: DataRepository, storm_id: str) -> dict:
    try:
        storm = repository.get_storm(storm_id)
    except DataAssetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    if not storm:
        raise HTTPException(status_code=404, detail="Storm not found")
    return storm


def _summary_or_404(repository: DataRepository, storm_id: str) -> dict:
    storm = repository.get_storm_summary(storm_id)
    if not storm:
        raise HTTPException(status_code=404, detail="Storm not found")
    return storm


@router.get("/api/storms", response_model=StormCatalogResponse, tags=["storms"])
def storms(
    basin: str | None = None,
    classic: bool | None = None,
    season_from: int | None = Query(default=None, ge=1840, le=2200),
    season_to: int | None = Query(default=None, ge=1840, le=2200),
    min_wind_ms: float | None = Query(default=None, ge=0, le=150),
    landfall: bool | None = None,
    sort_by: str = Query(
        default="impact_score", pattern="^(impact_score|season|max_wind_ms)$"
    ),
    repository: DataRepository = Depends(get_repository),
):
    if season_from is not None and season_to is not None and season_from > season_to:
        raise HTTPException(status_code=422, detail="season_from must not exceed season_to")
    items = list(repository.list_storms())
    if basin:
        items = [item for item in items if item["basin"].lower() == basin.lower()]
    if classic is not None:
        items = [item for item in items if item["classic"] is classic]
    if season_from is not None:
        items = [item for item in items if item["season"] >= season_from]
    if season_to is not None:
        items = [item for item in items if item["season"] <= season_to]
    if min_wind_ms is not None:
        items = [
            item
            for item in items
            if item.get("max_wind_ms") is not None
            and item["max_wind_ms"] >= min_wind_ms
        ]
    if landfall is not None:
        items = [
            item for item in items if (item.get("landfall_count", 0) > 0) is landfall
        ]
    items.sort(key=lambda item: item.get(sort_by) or 0, reverse=True)
    summaries = [
        {
            key: value
            for key, value in item.items()
            if key not in {"track", "impact", "schema_version", "generated_at"}
        }
        for item in items
    ]
    source_ids = sorted(
        {source_id for item in summaries for source_id in item["source_ids"]}
    )
    fixture = repository.mode == "fixture"
    return {
        "items": summaries,
        "count": len(summaries),
        "data_status": "synthetic_fixture" if fixture else "mixed",
        "source_ids": source_ids,
    }


@router.get("/api/storms/{storm_id}", response_model=StormDetail, tags=["storms"])
def storm_detail(
    storm_id: str, repository: DataRepository = Depends(get_repository)
):
    return _storm_or_404(repository, storm_id)


@router.get(
    "/api/storms/{storm_id}/track",
    response_model=StormTrackResponse,
    tags=["storms"],
)
def storm_track(
    storm_id: str,
    start: datetime | None = None,
    end: datetime | None = None,
    repository: DataRepository = Depends(get_repository),
):
    if start and end and start > end:
        raise HTTPException(status_code=422, detail="start must not exceed end")
    if (start and start.tzinfo is None) or (end and end.tzinfo is None):
        raise HTTPException(status_code=422, detail="track time filters must include UTC offset")
    storm = _summary_or_404(repository, storm_id)
    try:
        track = repository.get_track(storm_id)
    except DataAssetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    points = [
        point
        for point in track["points"]
        if (start is None or datetime.fromisoformat(point["time"].replace("Z", "+00:00")) >= start)
        and (end is None or datetime.fromisoformat(point["time"].replace("Z", "+00:00")) <= end)
    ]
    if not points:
        raise HTTPException(status_code=404, detail="No track points in requested time range")
    return {
        "storm_id": storm_id,
        "points": points,
        "data_status": storm["data_status"],
        "source_ids": storm["source_ids"],
    }


@router.get(
    "/api/storms/{storm_id}/impact/summary",
    response_model=StormImpactResponse,
    tags=["impact"],
)
def storm_impact(
    storm_id: str, repository: DataRepository = Depends(get_repository)
):
    storm = _summary_or_404(repository, storm_id)
    return {
        "storm_id": storm_id,
        "estimated_exposed_population": None,
        "wind_footprint_area_km2": None,
        "reported_deaths": storm.get("reported_deaths"),
        "reported_affected_population": None,
        "reported_damage_usd_2024": storm.get("reported_damage_usd_2024"),
        "warning": (
            "Event impact grid is available through /api/impact/grid."
            if storm.get("impact_available")
            else "No event impact grid is available for this storm."
        ),
        "data_status": storm["data_status"],
        "source_ids": storm["source_ids"],
    }


@router.get(
    "/api/storms/{storm_id}/wind/manifest",
    response_model=WindManifest,
    tags=["wind"],
)
def wind_manifest(
    storm_id: str, repository: DataRepository = Depends(get_repository)
):
    try:
        return repository.get_wind_manifest(storm_id)
    except DataAssetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get(
    "/api/storms/{storm_id}/wind/sample-frame",
    response_model=WindFrame,
    tags=["wind"],
)
def sample_wind_frame(
    storm_id: str, repository: DataRepository = Depends(get_repository)
):
    try:
        return repository.get_wind_frame(storm_id)
    except DataAssetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get(
    "/api/storms/{storm_id}/wind/frames/{frame_name}",
    response_model=WindFrame,
    tags=["wind"],
)
def wind_frame(
    storm_id: str,
    frame_name: str,
    repository: DataRepository = Depends(get_repository),
):
    try:
        return repository.get_wind_frame(storm_id, frame_name)
    except DataAssetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get(
    "/api/wind/periods/{period_id}/manifest",
    response_model=WindManifest,
    tags=["wind"],
)
def period_wind_manifest(
    period_id: str, repository: DataRepository = Depends(get_repository)
):
    try:
        return repository.get_period_wind_manifest(period_id)
    except DataAssetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get(
    "/api/wind/periods/{period_id}/frames/{frame_name}",
    response_model=WindFrame,
    tags=["wind"],
)
def period_wind_frame(
    period_id: str,
    frame_name: str,
    repository: DataRepository = Depends(get_repository),
):
    try:
        return repository.get_period_wind_frame(period_id, frame_name)
    except DataAssetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
