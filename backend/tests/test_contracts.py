from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas import (
    FacilityCreate,
    ImpactGridCollection,
    StormTrackResponse,
    TrajectoryMatch,
    TrajectoryMatchRequest,
    WindFrame,
    WindManifest,
)


NOW = datetime(2020, 1, 1, tzinfo=timezone.utc)


def test_contracts_forbid_unknown_fields():
    with pytest.raises(ValidationError, match="extra_forbidden"):
        FacilityCreate.model_validate(
            {"type": "shelter", "lon": 121, "lat": 24, "typo": 1}
        )


def test_track_points_must_be_unique_and_ordered():
    with pytest.raises(ValidationError, match="ordered by time"):
        StormTrackResponse.model_validate(
            {
                "data_status": "observed",
                "source_ids": ["ibtracs"],
                "storm_id": "test",
                "points": [
                    {"time": "2020-01-02T00:00:00Z", "lon": 120, "lat": 20},
                    {"time": "2020-01-01T00:00:00Z", "lon": 121, "lat": 21},
                ],
            }
        )


def test_wind_arrays_must_match_grid_and_be_finite():
    with pytest.raises(ValidationError, match=r"width \* height"):
        WindFrame.model_validate(
            {
                "dataset_id": "test",
                "time": NOW,
                "width": 2,
                "height": 2,
                "u": [1, 2, 3],
                "v": [1, 2, 3],
            }
        )

    with pytest.raises(ValidationError, match="finite"):
        WindFrame.model_validate(
            {
                "dataset_id": "test",
                "time": NOW,
                "width": 2,
                "height": 2,
                "u": [1, 2, 3, float("nan")],
                "v": [1, 2, 3, 4],
            }
        )


def test_trajectory_requires_two_distinct_points_and_valid_seasons():
    with pytest.raises(ValidationError, match="distinct"):
        TrajectoryMatchRequest.model_validate(
            {
                "mode": "geographic",
                "points": [{"lon": 120, "lat": 20}, {"lon": 120, "lat": 20}],
            }
        )

    with pytest.raises(ValidationError, match="season_to"):
        TrajectoryMatchRequest.model_validate(
            {
                "mode": "shape",
                "points": [{"lon": 120, "lat": 20}, {"lon": 121, "lat": 21}],
                "filters": {"season_from": 2020, "season_to": 2000},
            }
        )


def test_impact_grid_rejects_exposure_above_population():
    with pytest.raises(ValidationError, match="cannot exceed"):
        ImpactGridCollection.model_validate(
            {
                "data_status": "modeled",
                "source_ids": ["worldpop"],
                "metric": "exposed_population",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [[120, 20], [121, 20], [121, 21], [120, 20]]
                            ],
                        },
                        "properties": {
                            "cell_id": "cell-1",
                            "time_start": "2020-01-01T00:00:00Z",
                            "time_end": "2020-01-02T00:00:00Z",
                            "population": 100,
                            "exposed_population": 101,
                            "contributing_storm_ids": ["storm-1"],
                            "data_status": "modeled",
                            "source_ids": ["worldpop"],
                        },
                    }
                ],
            }
        )


def test_facility_defaults_and_units_are_type_safe():
    medical = FacilityCreate(type="medical", lon=121.5, lat=25)
    assert medical.capacity_value == 50
    assert medical.capacity_unit.value == "beds"
    assert medical.service_radius_km == 15

    with pytest.raises(ValidationError, match="capacity must use"):
        FacilityCreate.model_validate(
            {
                "type": "warehouse",
                "lon": 121,
                "lat": 24,
                "capacity_value": 100,
                "capacity_unit": "people",
            }
        )


def test_real_data_requires_provenance():
    with pytest.raises(ValidationError, match="source_id"):
        WindManifest.model_validate(
            {
                "dataset_id": "era5-test",
                "mode": "global",
                "data_status": "reanalysis",
                "source_ids": [],
                "bounds": {"west": 0, "south": -10, "east": 10, "north": 10},
                "resolution_degrees": 1,
                "width": 11,
                "height": 21,
                "frames": [
                    {"time": "2020-01-01T00:00:00Z", "url": "/wind/0"}
                ],
            }
        )


def test_wind_manifest_grid_shape_matches_bounds():
    with pytest.raises(ValidationError, match="inclusive grid"):
        WindManifest.model_validate(
            {
                "dataset_id": "fixture",
                "mode": "global",
                "data_status": "synthetic_fixture",
                "bounds": {"west": 0, "south": -10, "east": 10, "north": 10},
                "resolution_degrees": 1,
                "width": 10,
                "height": 21,
                "frames": [
                    {"time": "2020-01-01T00:00:00Z", "url": "/wind/0"}
                ],
            }
        )


def test_match_score_uses_documented_components():
    match = TrajectoryMatch.model_validate(
        {
            "storm_id": "storm-1",
            "rank": 1,
            "similarity": 0.8,
            "frechet_component": 0.8,
            "direction_component": 0.8,
            "explanation": "components agree",
        }
    )
    assert match.similarity == 0.8

    with pytest.raises(ValidationError, match="0.6"):
        TrajectoryMatch.model_validate(
            {
                "storm_id": "storm-1",
                "rank": 1,
                "similarity": 0.9,
                "frechet_component": 0.8,
                "direction_component": 0.8,
                "explanation": "inconsistent total",
            }
        )
