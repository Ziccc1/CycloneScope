from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..dependencies import get_repository
from ..query import geometry_intersects_bounds, parse_bbox
from ..repository import DataAssetNotFound, DataRepository
from ..schemas import ImpactGridCollection


router = APIRouter()


@router.get("/api/impact/grid", response_model=ImpactGridCollection, tags=["impact"])
def impact_grid(
    storm_id: str | None = None,
    window_id: str | None = None,
    metric: str | None = None,
    bbox: str | None = None,
    hazard_threshold: float | None = None,
    repository: DataRepository = Depends(get_repository),
):
    if hazard_threshold is not None and not 0 <= hazard_threshold <= 1:
        raise HTTPException(status_code=422, detail="hazard_threshold must be in [0, 1]")
    try:
        payload = repository.get_impact_grid(storm_id, window_id)
    except DataAssetNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    allowed_metrics = {
        "hazard_index",
        "max_wind_ms",
        "precip_mm",
        "population",
        "exposed_population",
        "reported_damage_usd",
    }
    selected_metric = metric or payload["metric"]
    if selected_metric not in allowed_metrics:
        raise HTTPException(status_code=422, detail="Unsupported impact metric")
    bounds = parse_bbox(bbox)
    features = [
        feature
        for feature in payload["features"]
        if geometry_intersects_bounds(feature["geometry"]["coordinates"], bounds)
        and (
            hazard_threshold is None
            or (feature["properties"].get("hazard_index") or 0) >= hazard_threshold
        )
    ]
    return {**payload, "metric": selected_metric, "features": features}
