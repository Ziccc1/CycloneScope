from __future__ import annotations

import gzip
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol

from pydantic import TypeAdapter

from .schemas import (
    DataSource,
    FacilityCollection,
    ImpactGridCollection,
    StormCatalogResponse,
    StormDetail,
    TaiwanZoneCollection,
    WindFrame,
    WindManifest,
)


DATA_ROOT = Path(__file__).resolve().parents[1] / "data"
SAMPLE_ROOT = DATA_ROOT / "samples"
PROCESSED_ROOT = DATA_ROOT / "processed"


class DataAssetNotFound(FileNotFoundError):
    """Raised when a requested local data product is unavailable."""


class DataRepository(Protocol):
    mode: str

    def list_sources(self) -> list[dict[str, Any]]: ...

    def list_storms(self) -> list[dict[str, Any]]: ...

    def get_storm(self, storm_id: str) -> dict[str, Any] | None: ...

    def get_wind_manifest(self, storm_id: str) -> dict[str, Any]: ...

    def get_wind_frame(self, storm_id: str, frame_name: str | None = None) -> dict[str, Any]: ...

    def get_period_wind_manifest(self, period_id: str) -> dict[str, Any]: ...

    def get_impact_grid(
        self, storm_id: str | None, window_id: str | None
    ) -> dict[str, Any]: ...

    def get_taiwan_zones(self) -> dict[str, Any]: ...

    def get_taiwan_facilities(self) -> dict[str, Any]: ...


def _read_json(path: Path) -> Any:
    if not path.exists():
        raise DataAssetNotFound(f"Local data asset not found: {path}")
    if path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=128)
def _read_json_cached(path_text: str, modified_ns: int) -> Any:
    del modified_ns
    return _read_json(Path(path_text))


def _cached(path: Path) -> Any:
    if not path.exists():
        raise DataAssetNotFound(f"Local data asset not found: {path}")
    return _read_json_cached(str(path.resolve()), path.stat().st_mtime_ns)


class FixtureRepository:
    mode = "fixture"

    def list_sources(self) -> list[dict[str, Any]]:
        payload = _cached(SAMPLE_ROOT / "data-sources.json")
        models = TypeAdapter(list[DataSource]).validate_python(payload)
        return [model.model_dump(mode="json") for model in models]

    def list_storms(self) -> list[dict[str, Any]]:
        payload = _cached(SAMPLE_ROOT / "storms.json")
        models = TypeAdapter(list[StormDetail]).validate_python(payload)
        return [model.model_dump(mode="json") for model in models]

    def get_storm(self, storm_id: str) -> dict[str, Any] | None:
        return next((item for item in self.list_storms() if item["id"] == storm_id), None)

    def get_wind_manifest(self, storm_id: str) -> dict[str, Any]:
        if not self.get_storm(storm_id):
            raise DataAssetNotFound(f"Storm not found: {storm_id}")
        frame = self.get_wind_frame(storm_id)
        payload = {
            "dataset_id": f"{storm_id}-demo-wind",
            "mode": "storm",
            "storm_id": storm_id,
            "data_status": "synthetic_fixture",
            "source_ids": [],
            "bounds": {"west": 120, "south": 20, "east": 124, "north": 24},
            "resolution_degrees": 1.0,
            "width": frame["width"],
            "height": frame["height"],
            "frames": [
                {
                    "time": frame["time"],
                    "url": f"/api/storms/{storm_id}/wind/sample-frame",
                }
            ],
        }
        return WindManifest.model_validate(payload).model_dump(mode="json")

    def get_wind_frame(
        self, storm_id: str, frame_name: str | None = None
    ) -> dict[str, Any]:
        del frame_name
        if not self.get_storm(storm_id):
            raise DataAssetNotFound(f"Storm not found: {storm_id}")
        payload = _cached(SAMPLE_ROOT / "wind-demo.json")
        return WindFrame.model_validate(payload).model_dump(mode="json")

    def get_period_wind_manifest(self, period_id: str) -> dict[str, Any]:
        if period_id != "demo-global":
            raise DataAssetNotFound(f"Wind period not found: {period_id}")
        frame = WindFrame.model_validate(_cached(SAMPLE_ROOT / "wind-demo.json"))
        return WindManifest.model_validate(
            {
                "dataset_id": "demo-global",
                "mode": "global",
                "data_status": "synthetic_fixture",
                "source_ids": [],
                "bounds": {"west": 120, "south": 20, "east": 124, "north": 24},
                "resolution_degrees": 1,
                "width": frame.width,
                "height": frame.height,
                "frames": [
                    {
                        "time": frame.time,
                        "url": "/api/storms/demo-morakot-2009/wind/sample-frame",
                    }
                ],
            }
        ).model_dump(mode="json")

    def get_impact_grid(
        self, storm_id: str | None, window_id: str | None
    ) -> dict[str, Any]:
        del storm_id, window_id
        payload = _cached(SAMPLE_ROOT / "impact-grid.json")
        return ImpactGridCollection.model_validate(payload).model_dump(mode="json")

    def get_taiwan_zones(self) -> dict[str, Any]:
        payload = _cached(SAMPLE_ROOT / "taiwan-zones.json")
        return TaiwanZoneCollection.model_validate(payload).model_dump(mode="json")

    def get_taiwan_facilities(self) -> dict[str, Any]:
        payload = _cached(SAMPLE_ROOT / "taiwan-facilities.json")
        return FacilityCollection.model_validate(payload).model_dump(mode="json")


class ProcessedRepository:
    mode = "processed"

    def __init__(self, root: Path = PROCESSED_ROOT):
        self.root = root

    def _first_existing(self, paths: list[Path]) -> Path:
        for path in paths:
            if path.exists():
                return path
        raise DataAssetNotFound(
            "No processed data asset found. Expected one of: "
            + ", ".join(str(path) for path in paths)
        )

    def list_sources(self) -> list[dict[str, Any]]:
        path = self._first_existing(
            [self.root / "catalog" / "data-sources.json", SAMPLE_ROOT / "data-sources.json"]
        )
        payload = _cached(path)
        models = TypeAdapter(list[DataSource]).validate_python(payload)
        return [model.model_dump(mode="json") for model in models]

    def list_storms(self) -> list[dict[str, Any]]:
        payload = _cached(self.root / "catalog" / "storms-summary.json")
        catalog = StormCatalogResponse.model_validate(payload)
        return [item.model_dump(mode="json") for item in catalog.items]

    def _detail_candidates(self, storm_id: str) -> list[Path]:
        return [
            self.root / "catalog" / "details" / f"{storm_id}.json",
            self.root / "catalog" / f"{storm_id}.json",
        ]

    def get_storm(self, storm_id: str) -> dict[str, Any] | None:
        try:
            path = self._first_existing(self._detail_candidates(storm_id))
        except DataAssetNotFound:
            return None
        return StormDetail.model_validate(_cached(path)).model_dump(mode="json")

    def get_wind_manifest(self, storm_id: str) -> dict[str, Any]:
        path = self.root / "wind" / "storms" / storm_id / "manifest.json"
        return WindManifest.model_validate(_cached(path)).model_dump(mode="json")

    def get_wind_frame(
        self, storm_id: str, frame_name: str | None = None
    ) -> dict[str, Any]:
        if not frame_name:
            raise DataAssetNotFound("Processed wind frames require a frame name")
        safe_name = Path(frame_name).name
        base = self.root / "wind" / "storms" / storm_id / "frames"
        path = self._first_existing([base / safe_name, base / f"{safe_name}.json", base / f"{safe_name}.json.gz"])
        return WindFrame.model_validate(_cached(path)).model_dump(mode="json")

    def get_period_wind_manifest(self, period_id: str) -> dict[str, Any]:
        path = self.root / "wind" / "global" / period_id / "manifest.json"
        return WindManifest.model_validate(_cached(path)).model_dump(mode="json")

    def get_impact_grid(
        self, storm_id: str | None, window_id: str | None
    ) -> dict[str, Any]:
        if storm_id:
            path = self.root / "impact" / "storms" / storm_id / "grid.geojson"
        elif window_id:
            path = self.root / "impact" / "windows" / window_id / "grid.geojson"
        else:
            raise DataAssetNotFound("Processed impact queries require storm_id or window_id")
        return ImpactGridCollection.model_validate(_cached(path)).model_dump(mode="json")

    def get_taiwan_zones(self) -> dict[str, Any]:
        path = self.root / "taiwan" / "zones.geojson"
        return TaiwanZoneCollection.model_validate(_cached(path)).model_dump(mode="json")

    def get_taiwan_facilities(self) -> dict[str, Any]:
        path = self.root / "taiwan" / "facilities.geojson"
        return FacilityCollection.model_validate(_cached(path)).model_dump(mode="json")


def create_repository(mode: str) -> DataRepository:
    if mode == "fixture":
        return FixtureRepository()
    if mode == "processed":
        return ProcessedRepository()
    raise ValueError("CYCLONESCOPE_DATA_MODE must be 'fixture' or 'processed'")
