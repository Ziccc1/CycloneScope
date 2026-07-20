from __future__ import annotations

import gzip
import json
from datetime import datetime, timezone

import pytest
import pyarrow as pa
import pyarrow.parquet as pq

from app.data_adapter import read_parquet_rows
from app.repository import (
    DataAssetNotFound,
    FixtureRepository,
    ProcessedRepository,
    create_repository,
)


def test_parquet_adapter_filters_a_rows_without_pandas(tmp_path):
    path = tmp_path / "tracks.parquet"
    pq.write_table(
        pa.table(
            {
                "storm_id": ["storm-1", "storm-2"],
                "time": [
                    datetime(2020, 1, 1, tzinfo=timezone.utc),
                    datetime(2021, 1, 1, tzinfo=timezone.utc),
                ],
                "is_landfall": [None, True],
                "wind_ms": [float("nan"), 30.0],
            }
        ),
        path,
    )
    rows = read_parquet_rows(
        path,
        columns=["storm_id", "time", "is_landfall", "wind_ms"],
        filters=[("storm_id", "=", "storm-1")],
    )
    assert rows == [
        {
            "storm_id": "storm-1",
            "time": datetime(2020, 1, 1, tzinfo=timezone.utc),
            "is_landfall": None,
            "wind_ms": None,
        }
    ]


def test_fixture_repository_products_are_contract_valid():
    repository = FixtureRepository()
    assert len(repository.list_storms()) == 3
    assert len(repository.get_impact_grid(None, None)["features"]) == 20
    assert len(repository.get_taiwan_zones()["features"]) == 3
    assert len(repository.get_taiwan_facilities()["features"]) == 10


def test_processed_repository_does_not_fall_back_to_fixture(tmp_path):
    repository = ProcessedRepository(tmp_path)
    with pytest.raises(DataAssetNotFound, match="storms-summary"):
        repository.list_storms()
    with pytest.raises(DataAssetNotFound, match="zones.geojson"):
        repository.get_taiwan_zones()


def test_processed_repository_reads_gzip_wind_frames(tmp_path):
    frame_dir = tmp_path / "era5" / "wind" / "storms" / "storm-1" / "frames"
    frame_dir.mkdir(parents=True)
    payload = {
        "schema_version": "1.0",
        "dataset_id": "storm-1-wind",
        "time": "2020-01-01T00:00:00Z",
        "width": 2,
        "height": 2,
        "u": [1, 1, 1, 1],
        "v": [0, 0, 0, 0],
        "missing_value": None,
    }
    with gzip.open(frame_dir / "frame-0.json.gz", "wt", encoding="utf-8") as handle:
        json.dump(payload, handle)

    frame = ProcessedRepository(tmp_path).get_wind_frame("storm-1", "frame-0")
    assert frame["width"] == 2
    assert frame["u"] == [1.0, 1.0, 1.0, 1.0]


def test_processed_repository_adapts_a_v21_catalog_track_and_manifest(
    tmp_path, monkeypatch
):
    catalog_dir = tmp_path / "catalog"
    catalog_dir.mkdir()
    catalog = {
        "schema_version": "1.0",
        "data_status": "observed",
        "source_ids": ["ibtracs_since1980"],
        "generated_at": "2026-07-20T00:00:00Z",
        "count": 1,
        "items": [
            {
                "id": "storm-1",
                "name": "TEST",
                "season": 2020,
                "basin": "WP",
                "start_time": "2020-01-01T00:00:00Z",
                "end_time": "2020-01-01T06:00:00Z",
                "max_wind_ms": 40,
                "min_pressure_hpa": 950,
                "duration_hours": 6,
                "ace": 1,
                "landfall_count": 0,
                "classic": False,
                "classic_rank": None,
                "impact_score": None,
                "score_coverage": 0,
                "reported_deaths": None,
                "reported_damage_usd_2024": None,
                "wind_available": True,
                "impact_available": False,
                "data_status": "observed",
                "source_ids": ["ibtracs_since1980"],
            }
        ],
    }
    (catalog_dir / "storms-summary.json").write_text(
        json.dumps(catalog), encoding="utf-8"
    )
    classic_dir = tmp_path / "classic"
    classic_dir.mkdir()
    (classic_dir / "classic-storms.json").write_text(
        json.dumps(
            {
                "items": [{"id": "storm-1", "classic_rank": 1}],
                "count": 1,
            }
        ),
        encoding="utf-8",
    )
    track_path = (
        tmp_path
        / "ibtracs-global-since1980"
        / "tracks"
        / "track-points.parquet"
    )
    track_path.parent.mkdir(parents=True)
    track_path.touch()

    def fake_parquet(path, *, columns=None, filters=None):
        assert path == track_path
        assert filters == [("storm_id", "=", "storm-1")]
        return [
            {
                "storm_id": "storm-1",
                "time": "2020-01-01T00:00:00Z",
                "lon": 120,
                "lat": 20,
                "wind_ms": 40,
                "pressure_hpa": 950,
                "category": "C1",
                "storm_status": "TY",
                "moving_speed_kmh": 10,
                "is_landfall": None,
                "source_agency": "WMO",
            },
            {
                "storm_id": "storm-1",
                "time": "2020-01-01T06:00:00Z",
                "lon": 121,
                "lat": 21,
                "wind_ms": 35,
                "pressure_hpa": 960,
                "category": "TS",
                "storm_status": "TS",
                "moving_speed_kmh": 9,
                "is_landfall": None,
                "source_agency": "WMO",
            },
        ]

    monkeypatch.setattr("app.repository.read_parquet_rows", fake_parquet)
    wind_root = tmp_path / "era5" / "wind" / "storms" / "storm-1"
    wind_root.mkdir(parents=True)
    manifest = {
        "schema_version": "1.0",
        "data_status": "reanalysis",
        "source_ids": ["era5"],
        "generated_at": "2026-07-20T00:00:00Z",
        "dataset_id": "storm-1-era5",
        "mode": "storm",
        "storm_id": "storm-1",
        "units": "m/s",
        "grid_order": "north_to_south_west_to_east_row_major",
        "bounds": {"west": 120, "south": 20, "east": 121, "north": 21},
        "resolution_degrees": 1,
        "width": 2,
        "height": 2,
        "frames": [
            {
                "time": "2020-01-01T00:00:00Z",
                "url": "wind/storms/storm-1/frames/frame-0.json.gz",
            }
        ],
    }
    (wind_root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    impact_path = tmp_path / "impact" / "storms" / "storm-1" / "grid.geojson"
    impact_path.parent.mkdir(parents=True)
    impact_path.write_text("{}", encoding="utf-8")

    repository = ProcessedRepository(tmp_path)
    summary = repository.get_storm_summary("storm-1")
    assert summary["classic"] is True
    assert summary["classic_rank"] == 1
    assert summary["wind_available"] is True
    assert summary["impact_available"] is True
    assert repository.get_track("storm-1")["points"][0]["is_landfall"] is None
    assert len(repository.get_storm("storm-1")["track"]) == 2
    assert (
        repository.get_wind_manifest("storm-1")["frames"][0]["url"]
        == "/api/storms/storm-1/wind/frames/frame-0.json.gz"
    )


def test_processed_repository_maps_a_source_manifest(tmp_path):
    repository = ProcessedRepository(tmp_path)
    sources = repository.list_sources()
    assert any(source["id"] == "ibtracs_since1980" for source in sources)


def test_processed_repository_adapts_service_area_defaults(tmp_path, monkeypatch):
    path = tmp_path / "taiwan" / "roads" / "facility-service-area.parquet"
    path.parent.mkdir(parents=True)
    path.touch()

    monkeypatch.setattr(
        "app.repository.read_parquet_rows",
        lambda *args, **kwargs: [
            {
                "facility_id": "facility-1",
                "facility_type": "shelter",
                "zone_id": "zone-1",
                "travel_time_min": 8.5,
                "reachable_population": 1234.4,
                "service_threshold_min": 10,
                "coverage_method": "network_travel_time",
                "population_reference": "WorldPop ADM1 aggregate",
            }
        ],
    )

    result = ProcessedRepository(tmp_path).get_facility_service_area("facility-1")
    assert result["count"] == 1
    assert result["items"][0]["reachable_population"] == 1234
    assert result["items"][0]["travel_time_quality"] == "low"
    assert (
        result["items"][0]["speed_source"]
        == "mixed_osm_and_default_by_road_class"
    )


def test_repository_mode_is_explicit():
    assert create_repository("fixture").mode == "fixture"
    assert create_repository("processed").mode == "processed"
    with pytest.raises(ValueError, match="fixture"):
        create_repository("auto")
