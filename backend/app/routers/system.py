from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..dependencies import get_db, get_repository
from ..repository import DataRepository
from ..schemas import DataSourceListResponse, HealthResponse


router = APIRouter()


@router.get("/api/health", response_model=HealthResponse, tags=["system"])
def health(
    db: Session = Depends(get_db),
    repository: DataRepository = Depends(get_repository),
):
    db.execute(text("SELECT 1"))
    fixture = repository.mode == "fixture"
    return {
        "status": "ok",
        "service": "cyclonescope-api",
        "version": "0.2.0-local",
        "database": "sqlite",
        "sample_data": fixture,
        "data_mode": repository.mode,
        "data_status": "synthetic_fixture" if fixture else "mixed",
    }


@router.get("/api/data-sources", response_model=DataSourceListResponse, tags=["data"])
def data_sources(repository: DataRepository = Depends(get_repository)):
    items = repository.list_sources()
    return {"items": items, "count": len(items)}
