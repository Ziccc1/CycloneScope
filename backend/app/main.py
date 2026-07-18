from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.orm import Session, selectinload

from .database import Base, create_database
from .evaluation import evaluate_facilities
from .models import Facility, Scenario
from .sample_store import get_storm, load_sample_wind, load_sources, load_storms
from .schemas import (
    DataSourceListResponse,
    EvaluationRequest,
    EvaluationResponse,
    FacilityCreate,
    FacilityRead,
    GeoBounds,
    HealthResponse,
    ScenarioCreate,
    ScenarioRead,
    StormCatalogResponse,
    StormDetail,
    StormImpactResponse,
    StormTrackResponse,
    WindFrame,
    WindFrameReference,
    WindManifest,
)


DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "cyclonescope.db"
DEFAULT_DATABASE_URL = f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"


def create_app(database_url: str | None = None) -> FastAPI:
    resolved_database_url = database_url or os.getenv(
        "CYCLONESCOPE_DATABASE_URL", DEFAULT_DATABASE_URL
    )
    engine, session_factory = create_database(resolved_database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        Base.metadata.create_all(engine)
        yield
        engine.dispose()

    app = FastAPI(
        title="CycloneScope API",
        version="0.1.0-local",
        description="高影响热带气旋可视分析与台湾设施情景系统的本地 API 骨架。",
        lifespan=lifespan,
    )
    app.state.session_factory = session_factory

    origins = os.getenv("CYCLONESCOPE_CORS_ORIGINS", "http://localhost:5173")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in origins.split(",") if origin.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def get_db(request: Request):
        db = request.app.state.session_factory()
        try:
            yield db
        finally:
            db.close()

    @app.get("/api/health", response_model=HealthResponse, tags=["system"])
    def health(db: Session = Depends(get_db)):
        db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "service": "cyclonescope-api",
            "version": app.version,
            "database": "sqlite",
            "sample_data": True,
        }

    @app.get(
        "/api/data-sources", response_model=DataSourceListResponse, tags=["data"]
    )
    def data_sources():
        return {"items": load_sources(), "count": len(load_sources())}

    @app.get("/api/storms", response_model=StormCatalogResponse, tags=["storms"])
    def storms(
        basin: str | None = None,
        classic: bool | None = None,
        sort_by: str = Query(
            default="impact_score", pattern="^(impact_score|season|max_wind_ms)$"
        ),
    ):
        items = list(load_storms())
        if basin:
            items = [item for item in items if item["basin"].lower() == basin.lower()]
        if classic is not None:
            items = [item for item in items if item["classic"] is classic]
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
        return {
            "items": summaries,
            "count": len(summaries),
            "data_status": "synthetic_fixture",
            "source_ids": source_ids,
        }

    @app.get("/api/storms/{storm_id}", response_model=StormDetail, tags=["storms"])
    def storm_detail(storm_id: str):
        storm = get_storm(storm_id)
        if not storm:
            raise HTTPException(status_code=404, detail="Storm not found")
        return storm

    @app.get(
        "/api/storms/{storm_id}/track",
        response_model=StormTrackResponse,
        tags=["storms"],
    )
    def storm_track(storm_id: str):
        storm = get_storm(storm_id)
        if not storm:
            raise HTTPException(status_code=404, detail="Storm not found")
        return {
            "storm_id": storm_id,
            "points": storm["track"],
            "data_status": storm["data_status"],
            "source_ids": storm["source_ids"],
        }

    @app.get(
        "/api/storms/{storm_id}/impact/summary",
        response_model=StormImpactResponse,
        tags=["impact"],
    )
    def storm_impact(storm_id: str):
        storm = get_storm(storm_id)
        if not storm:
            raise HTTPException(status_code=404, detail="Storm not found")
        return {
            "storm_id": storm_id,
            **storm["impact"],
            "data_status": storm["data_status"],
            "source_ids": storm["source_ids"],
        }

    @app.get(
        "/api/storms/{storm_id}/wind/manifest",
        response_model=WindManifest,
        tags=["wind"],
    )
    def wind_manifest(storm_id: str):
        storm = get_storm(storm_id)
        if not storm:
            raise HTTPException(status_code=404, detail="Storm not found")
        frame = load_sample_wind()
        return WindManifest(
            dataset_id=f"{storm_id}-demo-wind",
            mode="storm",
            storm_id=storm_id,
            data_status="synthetic_fixture",
            source_ids=[],
            bounds=GeoBounds(west=120, south=20, east=124, north=24),
            resolution_degrees=1.0,
            width=frame["width"],
            height=frame["height"],
            frames=[
                WindFrameReference(
                    time=frame["time"],
                    url=f"/api/storms/{storm_id}/wind/sample-frame",
                )
            ],
        )

    @app.get(
        "/api/storms/{storm_id}/wind/sample-frame",
        response_model=WindFrame,
        tags=["wind"],
    )
    def sample_wind_frame(storm_id: str):
        if not get_storm(storm_id):
            raise HTTPException(status_code=404, detail="Storm not found")
        return load_sample_wind()

    @app.post(
        "/api/scenarios",
        response_model=ScenarioRead,
        status_code=status.HTTP_201_CREATED,
        tags=["scenarios"],
    )
    def create_scenario(payload: ScenarioCreate, db: Session = Depends(get_db)):
        scenario = Scenario(id=str(uuid4()), name=payload.name)
        db.add(scenario)
        db.commit()
        db.refresh(scenario)
        return scenario

    @app.get("/api/scenarios", response_model=list[ScenarioRead], tags=["scenarios"])
    def list_scenarios(db: Session = Depends(get_db)):
        return list(db.scalars(select(Scenario).order_by(Scenario.created_at.desc())))

    @app.post(
        "/api/scenarios/{scenario_id}/facilities",
        response_model=FacilityRead,
        status_code=status.HTTP_201_CREATED,
        tags=["scenarios"],
    )
    def add_facility(
        scenario_id: str, payload: FacilityCreate, db: Session = Depends(get_db)
    ):
        scenario = db.get(Scenario, scenario_id)
        if not scenario:
            raise HTTPException(status_code=404, detail="Scenario not found")
        facility = Facility(
            id=str(uuid4()),
            scenario_id=scenario_id,
            is_simulated=True,
            **payload.model_dump(mode="json"),
        )
        db.add(facility)
        db.commit()
        db.refresh(facility)
        return facility

    @app.post(
        "/api/scenarios/{scenario_id}/evaluate",
        response_model=EvaluationResponse,
        tags=["scenarios"],
    )
    def evaluate_scenario(
        scenario_id: str, payload: EvaluationRequest, db: Session = Depends(get_db)
    ):
        statement = (
            select(Scenario)
            .where(Scenario.id == scenario_id)
            .options(selectinload(Scenario.facilities))
        )
        scenario = db.scalar(statement)
        if not scenario:
            raise HTTPException(status_code=404, detail="Scenario not found")
        result = evaluate_facilities(scenario.facilities, payload.at_risk_population)
        return {"scenario_id": scenario_id, **result}

    return app


app = create_app()
