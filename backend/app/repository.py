from __future__ import annotations

import gzip
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Protocol

from pydantic import TypeAdapter

from .data_adapter import read_parquet_rows, resolve_processed_root
from .schemas import (
    DataSource,
    FacilityCollection,
    FacilityServiceAreaResponse,
    ImpactGridCollection,
    StormCatalogResponse,
    StormDetail,
    StormImpact,
    StormSummary,
    StormTrackResponse,
    TaiwanZoneCollection,
    WindFrame,
    WindManifest,
)


DATA_ROOT = Path(__file__).resolve().parents[1] / "data"
SAMPLE_ROOT = DATA_ROOT / "samples"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DOCS_DATA_ROOT = PROJECT_ROOT / "docs" / "data-processing"


class DataAssetNotFound(FileNotFoundError):
    """Raised when a requested local data product is unavailable."""


class DataRepository(Protocol):
    mode: str

    def list_sources(self) -> list[dict[str, Any]]: ...

    def list_storms(self) -> list[dict[str, Any]]: ...

    def get_storm_summary(self, storm_id: str) -> dict[str, Any] | None: ...

    def get_storm(self, storm_id: str) -> dict[str, Any] | None: ...

    def get_track(self, storm_id: str) -> dict[str, Any]: ...

    def get_wind_manifest(self, storm_id: str) -> dict[str, Any]: ...

    def get_wind_frame(self, storm_id: str, frame_name: str | None = None) -> dict[str, Any]: ...

    def get_period_wind_manifest(self, period_id: str) -> dict[str, Any]: ...

    def get_period_wind_frame(
        self, period_id: str, frame_name: str
    ) -> dict[str, Any]: ...

    def get_impact_grid(
        self, storm_id: str | None, window_id: str | None
    ) -> dict[str, Any]: ...

    def get_taiwan_zones(self) -> dict[str, Any]: ...

    def get_taiwan_facilities(self) -> dict[str, Any]: ...

    def get_facility_service_area(self, facility_id: str) -> dict[str, Any]: ...


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

    def get_storm_summary(self, storm_id: str) -> dict[str, Any] | None:
        storm = self.get_storm(storm_id)
        if not storm:
            return None
        return {
            key: value
            for key, value in storm.items()
            if key not in {"track", "impact", "schema_version", "generated_at"}
        }

    def get_track(self, storm_id: str) -> dict[str, Any]:
        storm = self.get_storm(storm_id)
        if not storm:
            raise DataAssetNotFound(f"Storm not found: {storm_id}")
        return StormTrackResponse.model_validate(
            {
                "storm_id": storm_id,
                "points": storm["track"],
                "data_status": storm["data_status"],
                "source_ids": storm["source_ids"],
            }
        ).model_dump(mode="json")

    def get_wind_manifest(self, storm_id: str) -> dict[str, Any]:
        if not self.get_storm(storm_id):
            raise DataAssetNotFound(f"Storm not found: {storm_id}")
        frame = self.get_wind_frame(storm_id)
        payload = {
            "dataset_id": f"{storm_id}-demo-wind",
            "mode": "storm",
            "storm_id": storm_id,
            "capability": "dynamic",
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
                "capability": "dynamic",
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

    def get_period_wind_frame(
        self, period_id: str, frame_name: str
    ) -> dict[str, Any]:
        del frame_name
        if period_id != "demo-global":
            raise DataAssetNotFound(f"Wind period not found: {period_id}")
        return WindFrame.model_validate(
            _cached(SAMPLE_ROOT / "wind-demo.json")
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

    def get_facility_service_area(self, facility_id: str) -> dict[str, Any]:
        raise DataAssetNotFound(
            f"Fixture service-area data is unavailable for facility: {facility_id}"
        )


class ProcessedRepository:
    """Adapter from A's frozen v2.1 delivery layout to B's API contracts."""

    mode = "processed"
    track_columns = [
        "time",
        "lon",
        "lat",
        "wind_ms",
        "pressure_hpa",
        "category",
        "storm_status",
        "moving_speed_kmh",
        "is_landfall",
        "source_agency",
    ]

    def __init__(self, root: Path | str | None = None):
        self.root = resolve_processed_root(root)

    def _first_existing(self, paths: list[Path]) -> Path:
        for path in paths:
            if path.exists():
                return path
        raise DataAssetNotFound(
            "No processed data asset found. Expected one of: "
            + ", ".join(str(path) for path in paths)
        )

    def list_sources(self) -> list[dict[str, Any]]:
        direct = self.root / "catalog" / "data-sources.json"
        if direct.exists():
            payload = _cached(direct)
            models = TypeAdapter(list[DataSource]).validate_python(payload)
            return [model.model_dump(mode="json") for model in models]

        manifest_path = self._first_existing(
            [
                self.root.parent.parent / "docs" / "data-processing" / "source-manifest-v2.json",
                DOCS_DATA_ROOT / "source-manifest-v2.json",
            ]
        )
        records = _cached(manifest_path).get("records", [])
        payload = []
        for record in records:
            accessed_at = record.get("downloaded_at")
            if accessed_at and len(accessed_at) == 10:
                accessed_at = f"{accessed_at}T00:00:00Z"
            payload.append(
                {
                    "id": record["id"],
                    "name": record.get("dataset") or record["id"],
                    "url": record["url"],
                    "purpose": record.get("notes")
                    or f"Data source used by the CycloneScope v2.1 processing pipeline ({record.get('version', 'version unspecified')}).",
                    "status": record.get("status", "documented"),
                    "license_name": record.get("license"),
                    "accessed_at": accessed_at,
                }
            )
        models = TypeAdapter(list[DataSource]).validate_python(payload)
        return [model.model_dump(mode="json") for model in models]

    def list_storms(self) -> list[dict[str, Any]]:
        payload = _cached(self.root / "catalog" / "storms-summary.json")
        catalog = StormCatalogResponse.model_validate(payload)
        classic_ranks: dict[str, int] = {}
        classic_path = self.root / "classic" / "classic-storms.json"
        if classic_path.exists():
            classic_payload = _cached(classic_path)
            classic_ranks = {
                str(item["id"]): int(item.get("classic_rank") or rank)
                for rank, item in enumerate(classic_payload.get("items", []), start=1)
            }
        wind_ids = {
            path.parent.name
            for path in (self.root / "era5" / "wind" / "storms").glob(
                "*/manifest.json"
            )
        }
        impact_ids = {
            path.parent.name
            for path in (self.root / "impact" / "storms").glob("*/grid.geojson")
        }
        items = []
        for model in catalog.items:
            item = model.model_dump(mode="json")
            item["classic"] = item["id"] in classic_ranks
            item["classic_rank"] = classic_ranks.get(item["id"])
            item["wind_available"] = item["id"] in wind_ids
            item["impact_available"] = item["id"] in impact_ids
            items.append(StormSummary.model_validate(item).model_dump(mode="json"))
        return items

    def get_storm_summary(self, storm_id: str) -> dict[str, Any] | None:
        return next(
            (item for item in self.list_storms() if item["id"] == storm_id), None
        )

    def _track_path(self) -> Path:
        return self._first_existing(
            [
                self.root
                / "ibtracs-global-since1980"
                / "tracks"
                / "track-points.parquet",
                self.root / "ibtracs-wp-since1980" / "tracks" / "track-points.parquet",
            ]
        )

    def get_track(self, storm_id: str) -> dict[str, Any]:
        summary = self.get_storm_summary(storm_id)
        if not summary:
            raise DataAssetNotFound(f"Storm not found: {storm_id}")
        path = self._track_path()
        rows = read_parquet_rows(
            path,
            columns=["storm_id", *self.track_columns],
            filters=[("storm_id", "=", storm_id)],
        )
        points = [{key: row.get(key) for key in self.track_columns} for row in rows]
        if not points:
            raise DataAssetNotFound(f"Track not found for storm: {storm_id}")
        track_source_ids = [
            source_id
            for source_id in summary["source_ids"]
            if "ibtracs" in source_id.lower()
        ] or ["ibtracs_since1980"]
        return StormTrackResponse.model_validate(
            {
                "storm_id": storm_id,
                "points": points,
                "data_status": "observed",
                "source_ids": track_source_ids,
            }
        ).model_dump(mode="json")

    def get_storm(self, storm_id: str) -> dict[str, Any] | None:
        summary = self.get_storm_summary(storm_id)
        if not summary:
            return None
        track = self.get_track(storm_id)
        impact = StormImpact(
            reported_deaths=summary.get("reported_deaths"),
            reported_damage_usd_2024=summary.get("reported_damage_usd_2024"),
            warning=(
                "Event impact grid is available through /api/impact/grid."
                if summary.get("impact_available")
                else "No event impact grid is available for this storm."
            ),
        )
        return StormDetail.model_validate(
            {
                **summary,
                "track": track["points"],
                "impact": impact.model_dump(mode="json"),
            }
        ).model_dump(mode="json")

    def _storm_wind_root(self, storm_id: str) -> Path:
        return self.root / "era5" / "wind" / "storms" / storm_id

    def _period_wind_root(self, period_id: str) -> Path:
        return self.root / "era5" / "wind" / "global" / period_id

    def get_wind_manifest(self, storm_id: str) -> dict[str, Any]:
        payload = dict(_cached(self._storm_wind_root(storm_id) / "manifest.json"))
        matrix = _cached(self.root / "era5" / "qa" / "era5-capability-matrix.json")
        capability = next(
            (
                item
                for item in matrix.get("items", [])
                if str(item.get("storm_id")) == storm_id
            ),
            None,
        )
        if not capability or not capability.get("era5_available"):
            raise DataAssetNotFound(f"Wind capability not found for storm: {storm_id}")
        payload["capability"] = (
            "dynamic" if capability.get("has_dynamic") else "static"
        )
        payload["frames"] = [
            {
                **frame,
                "url": f"/api/storms/{storm_id}/wind/frames/{Path(frame['url']).name}",
            }
            for frame in payload["frames"]
        ]
        return WindManifest.model_validate(payload).model_dump(mode="json")

    def get_wind_frame(
        self, storm_id: str, frame_name: str | None = None
    ) -> dict[str, Any]:
        if not frame_name:
            raise DataAssetNotFound("Processed wind frames require a frame name")
        return self._read_frame(self._storm_wind_root(storm_id) / "frames", frame_name)

    def get_period_wind_manifest(self, period_id: str) -> dict[str, Any]:
        payload = dict(_cached(self._period_wind_root(period_id) / "manifest.json"))
        payload["capability"] = "dynamic"
        payload["frames"] = [
            {
                **frame,
                "url": f"/api/wind/periods/{period_id}/frames/{Path(frame['url']).name}",
            }
            for frame in payload["frames"]
        ]
        return WindManifest.model_validate(payload).model_dump(mode="json")

    def get_period_wind_frame(
        self, period_id: str, frame_name: str
    ) -> dict[str, Any]:
        return self._read_frame(
            self._period_wind_root(period_id) / "frames", frame_name
        )

    def _read_frame(self, base: Path, frame_name: str) -> dict[str, Any]:
        safe_name = Path(frame_name).name
        path = self._first_existing(
            [base / safe_name, base / f"{safe_name}.json", base / f"{safe_name}.json.gz"]
        )
        return WindFrame.model_validate(_cached(path)).model_dump(mode="json")

    def get_impact_grid(
        self, storm_id: str | None, window_id: str | None
    ) -> dict[str, Any]:
        if storm_id:
            path = self.root / "impact" / "storms" / storm_id / "grid.geojson"
        elif window_id:
            path = self.root / "impact" / "windows" / window_id / "grid.geojson"
        else:
            raise DataAssetNotFound(
                "Processed impact queries require storm_id or window_id"
            )
        return ImpactGridCollection.model_validate(_cached(path)).model_dump(mode="json")

    def get_taiwan_zones(self) -> dict[str, Any]:
        path = self.root / "taiwan" / "zones.geojson"
        return TaiwanZoneCollection.model_validate(_cached(path)).model_dump(mode="json")

    def get_taiwan_facilities(self) -> dict[str, Any]:
        path = self.root / "taiwan" / "facilities.geojson"
        return FacilityCollection.model_validate(_cached(path)).model_dump(mode="json")

    def get_facility_service_area(self, facility_id: str) -> dict[str, Any]:
        path = self.root / "taiwan" / "roads" / "facility-service-area.parquet"
        if not path.exists():
            raise DataAssetNotFound(f"Local data asset not found: {path}")
        rows = read_parquet_rows(
            path, filters=[("facility_id", "=", facility_id)]
        )
        if not rows:
            raise DataAssetNotFound(
                f"Service area not found for facility: {facility_id}"
            )
        for row in rows:
            row["facility_id"] = str(row["facility_id"])
            row["zone_id"] = str(row["zone_id"])
            row["reachable_population"] = int(round(row["reachable_population"]))
            row["service_threshold_min"] = int(row["service_threshold_min"])
            if not row.get("speed_source"):
                row["speed_source"] = "mixed_osm_and_default_by_road_class"
            if not row.get("travel_time_quality"):
                row["travel_time_quality"] = "low"
        return FacilityServiceAreaResponse.model_validate(
            {
                "facility_id": facility_id,
                "items": rows,
                "count": len(rows),
                "data_status": "modeled",
                "source_ids": ["osm", "worldpop"],
            }
        ).model_dump(mode="json")


def create_repository(
    mode: str, processed_root: Path | str | None = None
) -> DataRepository:
    if mode == "fixture":
        return FixtureRepository()
    if mode == "processed":
        return ProcessedRepository(processed_root)
    raise ValueError("CYCLONESCOPE_DATA_MODE must be 'fixture' or 'processed'")
