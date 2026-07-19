from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..dependencies import get_db, get_facility_evaluator
from ..models import Facility, Scenario
from ..schemas import (
    EvaluationRequest,
    EvaluationResponse,
    FacilityCreate,
    FacilityRead,
    FacilityUpdate,
    ScenarioCreate,
    ScenarioDetail,
    ScenarioRead,
    ScenarioUpdate,
)
from ..services import FacilityEvaluator


router = APIRouter()


def _scenario_or_404(db: Session, scenario_id: str) -> Scenario:
    statement = (
        select(Scenario)
        .where(Scenario.id == scenario_id)
        .options(selectinload(Scenario.facilities))
    )
    scenario = db.scalar(statement)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


def _facility_or_404(db: Session, scenario_id: str, facility_id: str) -> Facility:
    facility = db.scalar(
        select(Facility).where(
            Facility.id == facility_id, Facility.scenario_id == scenario_id
        )
    )
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    return facility


@router.post(
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


@router.get("/api/scenarios", response_model=list[ScenarioRead], tags=["scenarios"])
def list_scenarios(db: Session = Depends(get_db)):
    return list(db.scalars(select(Scenario).order_by(Scenario.created_at.desc())))


@router.get(
    "/api/scenarios/{scenario_id}",
    response_model=ScenarioDetail,
    tags=["scenarios"],
)
def get_scenario(scenario_id: str, db: Session = Depends(get_db)):
    return _scenario_or_404(db, scenario_id)


@router.patch(
    "/api/scenarios/{scenario_id}",
    response_model=ScenarioRead,
    tags=["scenarios"],
)
def update_scenario(
    scenario_id: str, payload: ScenarioUpdate, db: Session = Depends(get_db)
):
    scenario = _scenario_or_404(db, scenario_id)
    scenario.name = payload.name
    db.commit()
    db.refresh(scenario)
    return scenario


@router.delete(
    "/api/scenarios/{scenario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["scenarios"],
)
def delete_scenario(scenario_id: str, db: Session = Depends(get_db)):
    scenario = _scenario_or_404(db, scenario_id)
    db.delete(scenario)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/api/scenarios/{scenario_id}/facilities",
    response_model=list[FacilityRead],
    tags=["scenarios"],
)
def list_facilities(scenario_id: str, db: Session = Depends(get_db)):
    return _scenario_or_404(db, scenario_id).facilities


@router.post(
    "/api/scenarios/{scenario_id}/facilities",
    response_model=FacilityRead,
    status_code=status.HTTP_201_CREATED,
    tags=["scenarios"],
)
def add_facility(
    scenario_id: str, payload: FacilityCreate, db: Session = Depends(get_db)
):
    _scenario_or_404(db, scenario_id)
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


@router.patch(
    "/api/scenarios/{scenario_id}/facilities/{facility_id}",
    response_model=FacilityRead,
    tags=["scenarios"],
)
def update_facility(
    scenario_id: str,
    facility_id: str,
    payload: FacilityUpdate,
    db: Session = Depends(get_db),
):
    facility = _facility_or_404(db, scenario_id, facility_id)
    merged = {
        "type": facility.type,
        "lon": facility.lon,
        "lat": facility.lat,
        "capacity_value": facility.capacity_value,
        "capacity_unit": facility.capacity_unit,
        "service_radius_km": facility.service_radius_km,
        "budget_points": facility.budget_points,
    }
    changes = payload.model_dump(exclude_unset=True, mode="json")
    if "type" in changes and changes["type"] != facility.type:
        for field in (
            "capacity_value",
            "capacity_unit",
            "service_radius_km",
            "budget_points",
        ):
            if field not in changes:
                merged[field] = None
    merged.update(changes)
    validated = FacilityCreate.model_validate(merged)
    for field, value in validated.model_dump(mode="json").items():
        setattr(facility, field, value)
    db.commit()
    db.refresh(facility)
    return facility


@router.delete(
    "/api/scenarios/{scenario_id}/facilities/{facility_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["scenarios"],
)
def delete_facility(
    scenario_id: str, facility_id: str, db: Session = Depends(get_db)
):
    facility = _facility_or_404(db, scenario_id, facility_id)
    db.delete(facility)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/api/scenarios/{scenario_id}/evaluate",
    response_model=EvaluationResponse,
    tags=["scenarios"],
)
def evaluate_scenario(
    scenario_id: str,
    payload: EvaluationRequest,
    db: Session = Depends(get_db),
    evaluator: FacilityEvaluator = Depends(get_facility_evaluator),
):
    scenario = _scenario_or_404(db, scenario_id)
    result = evaluator.evaluate(scenario.facilities, payload.at_risk_population)
    return {"scenario_id": scenario_id, **result}
