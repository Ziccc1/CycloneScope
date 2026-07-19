from __future__ import annotations

from fastapi import APIRouter, Depends

from ..dependencies import get_repository, get_trajectory_matcher
from ..repository import DataRepository
from ..schemas import TrajectoryMatchRequest, TrajectoryMatchResponse
from ..services import TrajectoryMatcher


router = APIRouter()


@router.post(
    "/api/trajectory-match",
    response_model=TrajectoryMatchResponse,
    tags=["analysis"],
)
def trajectory_match(
    payload: TrajectoryMatchRequest,
    repository: DataRepository = Depends(get_repository),
    matcher: TrajectoryMatcher = Depends(get_trajectory_matcher),
):
    return matcher.match(payload, repository.list_storms())
