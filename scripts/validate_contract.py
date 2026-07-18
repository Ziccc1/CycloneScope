from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path
from typing import Any

from pydantic import BaseModel, TypeAdapter, ValidationError


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.schemas import (  # noqa: E402
    DataSource,
    EvaluationResponse,
    FacilityCollection,
    ImpactGridCollection,
    StormCatalogResponse,
    StormDetail,
    StormTrackResponse,
    TaiwanZoneCollection,
    TrackFeature,
    TrajectoryMatchRequest,
    TrajectoryMatchResponse,
    WindFrame,
    WindManifest,
)


VALIDATORS: dict[str, type[BaseModel] | TypeAdapter[Any]] = {
    "data-source-list": TypeAdapter(list[DataSource]),
    "storm-catalog": StormCatalogResponse,
    "storm-detail": StormDetail,
    "storm-detail-list": TypeAdapter(list[StormDetail]),
    "storm-track": StormTrackResponse,
    "wind-manifest": WindManifest,
    "wind-frame": WindFrame,
    "impact-grid": ImpactGridCollection,
    "taiwan-zones": TaiwanZoneCollection,
    "taiwan-facilities": FacilityCollection,
    "track-feature": TrackFeature,
    "track-feature-list": TypeAdapter(list[TrackFeature]),
    "trajectory-match-request": TrajectoryMatchRequest,
    "trajectory-match-response": TrajectoryMatchResponse,
    "evaluation-response": EvaluationResponse,
}


def read_json(path: Path) -> Any:
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate a CycloneScope JSON artifact against its executable contract."
    )
    parser.add_argument("kind", choices=sorted(VALIDATORS))
    parser.add_argument("path", type=Path)
    args = parser.parse_args()

    try:
        payload = read_json(args.path)
        validator = VALIDATORS[args.kind]
        if isinstance(validator, TypeAdapter):
            validator.validate_python(payload)
        else:
            validator.model_validate(payload)
    except (OSError, json.JSONDecodeError, ValidationError) as error:
        print(f"INVALID {args.kind}: {args.path}")
        print(error)
        return 1

    print(f"VALID {args.kind}: {args.path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
