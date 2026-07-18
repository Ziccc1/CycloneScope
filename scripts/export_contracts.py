from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.main import app  # noqa: E402
from backend.app.schemas import (  # noqa: E402
    DataSourceListResponse,
    EvaluationRequest,
    EvaluationResponse,
    FacilityCollection,
    FacilityCreate,
    FacilityRead,
    HealthResponse,
    ImpactGridCollection,
    ScenarioCreate,
    ScenarioRead,
    StormCatalogResponse,
    StormDetail,
    StormImpactResponse,
    StormTrackResponse,
    TaiwanZoneCollection,
    TrackFeature,
    TrajectoryMatchRequest,
    TrajectoryMatchResponse,
    WindFrame,
    WindManifest,
)


OUTPUT_DIR = PROJECT_ROOT / "schemas" / "generated"

EXPORTS = {
    "health-response": HealthResponse,
    "data-source-list": DataSourceListResponse,
    "storm-catalog": StormCatalogResponse,
    "storm-detail": StormDetail,
    "storm-track": StormTrackResponse,
    "storm-impact": StormImpactResponse,
    "wind-manifest": WindManifest,
    "wind-frame": WindFrame,
    "impact-grid": ImpactGridCollection,
    "taiwan-zones": TaiwanZoneCollection,
    "taiwan-facilities": FacilityCollection,
    "track-feature": TrackFeature,
    "trajectory-match-request": TrajectoryMatchRequest,
    "trajectory-match-response": TrajectoryMatchResponse,
    "scenario-create": ScenarioCreate,
    "scenario-read": ScenarioRead,
    "facility-create": FacilityCreate,
    "facility-read": FacilityRead,
    "evaluation-request": EvaluationRequest,
    "evaluation-response": EvaluationResponse,
}


def encode(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def expanded_openapi() -> dict[str, Any]:
    document = app.openapi()
    components = document.setdefault("components", {}).setdefault("schemas", {})
    for model in EXPORTS.values():
        schema = model.model_json_schema(
            ref_template="#/components/schemas/{model}"
        )
        definitions = schema.pop("$defs", {})
        components.update(definitions)
        components[model.__name__] = schema
    return document


def desired_outputs() -> dict[Path, str]:
    outputs = {
        OUTPUT_DIR / f"{name}.schema.json": encode(model.model_json_schema())
        for name, model in EXPORTS.items()
    }
    outputs[OUTPUT_DIR / "openapi.json"] = encode(expanded_openapi())
    outputs[OUTPUT_DIR / "catalog.json"] = encode(
        {
            "schema_version": "1.0",
            "source": "backend.app.schemas",
            "files": [
                {
                    "id": name,
                    "model": model.__name__,
                    "file": f"{name}.schema.json",
                }
                for name, model in EXPORTS.items()
            ],
        }
    )
    return outputs


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export CycloneScope Pydantic contracts to JSON Schema and OpenAPI."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Do not write; fail when committed generated contracts are stale.",
    )
    args = parser.parse_args()

    outputs = desired_outputs()
    if args.check:
        stale = [
            path
            for path, expected in outputs.items()
            if not path.exists() or path.read_text(encoding="utf-8") != expected
        ]
        if stale:
            for path in stale:
                print(f"stale: {path.relative_to(PROJECT_ROOT)}")
            print("Run: .venv\\Scripts\\python.exe scripts\\export_contracts.py")
            return 1
        print(f"Contract schemas are current ({len(outputs)} files).")
        return 0

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for path, content in outputs.items():
        path.write_text(content, encoding="utf-8", newline="\n")
    print(f"Exported {len(outputs)} contract files to {OUTPUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
