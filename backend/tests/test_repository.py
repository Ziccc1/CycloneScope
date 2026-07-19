from __future__ import annotations

import gzip
import json

import pytest

from app.repository import (
    DataAssetNotFound,
    FixtureRepository,
    ProcessedRepository,
    create_repository,
)


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
    frame_dir = tmp_path / "wind" / "storms" / "storm-1" / "frames"
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


def test_repository_mode_is_explicit():
    assert create_repository("fixture").mode == "fixture"
    assert create_repository("processed").mode == "processed"
    with pytest.raises(ValueError, match="fixture"):
        create_repository("auto")
