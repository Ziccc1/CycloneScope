from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, create_database
from .repository import create_repository
from .routers import impact, scenarios, storms, system, taiwan, trajectory
from .services import FixtureFacilityEvaluator, FixtureTrajectoryMatcher


DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "cyclonescope.db"
DEFAULT_DATABASE_URL = f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"


def create_app(
    database_url: str | None = None,
    data_mode: str | None = None,
) -> FastAPI:
    resolved_database_url = database_url or os.getenv(
        "CYCLONESCOPE_DATABASE_URL", DEFAULT_DATABASE_URL
    )
    resolved_data_mode = data_mode or os.getenv("CYCLONESCOPE_DATA_MODE", "fixture")
    engine, session_factory = create_database(resolved_database_url)
    repository = create_repository(resolved_data_mode)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        Base.metadata.create_all(engine)
        yield
        engine.dispose()

    app = FastAPI(
        title="CycloneScope API",
        version="0.2.0-local",
        description="高影响热带气旋可视分析与台湾设施情景系统的本地 API。",
        lifespan=lifespan,
    )
    app.state.session_factory = session_factory
    app.state.repository = repository
    app.state.facility_evaluator = FixtureFacilityEvaluator()
    app.state.trajectory_matcher = FixtureTrajectoryMatcher()

    origins = os.getenv(
        "CYCLONESCOPE_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            origin.strip() for origin in origins.split(",") if origin.strip()
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(system.router)
    app.include_router(storms.router)
    app.include_router(impact.router)
    app.include_router(taiwan.router)
    app.include_router(trajectory.router)
    app.include_router(scenarios.router)
    return app


app = create_app()
