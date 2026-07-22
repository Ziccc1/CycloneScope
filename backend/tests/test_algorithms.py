from app.algorithms.facilities import Facility, allocate_population, haversine_km
from app.algorithms.trajectory import TrackPoint, normalize_shape, resample_track, trajectory_distance
from app.algorithms.wind import WindFrame, advect_particle, bilinear_vector
from app.schemas import TrajectoryMatchRequest
from app.services import ProcessedTrajectoryMatcher


def test_track_resampling_and_normalization_are_deterministic():
    track = resample_track([TrackPoint(0, 0), TrackPoint(1, 0), TrackPoint(1, 1)], 5)
    assert track[0] == TrackPoint(0, 0)
    assert track[-1] == TrackPoint(1, 1)
    normalized = normalize_shape(track)
    assert normalized[0] == TrackPoint(0.0, 0.0)
    assert trajectory_distance(normalized, normalized) == 0


def test_wind_grid_direction_and_interpolation():
    frame = WindFrame(2, 2, 0, 0, 1, (1, 1, 1, 1), (0, 0, 0, 0))
    assert bilinear_vector(frame, 0.5, 0.5) == (1, 0)
    lon, lat = advect_particle(frame, 0.5, 0.5, 3600)
    assert lon > 0.5
    assert abs(lat - 0.5) < 1e-9


def test_facility_allocation_deduplicates_cells_and_respects_capacity():
    facility = Facility("shelter-1", 121.5, 24.0, 100, 10)
    assert haversine_km(121.5, 24.0, 121.5, 24.0) == 0
    result = allocate_population([facility], [(121.5, 24.0, 80), (121.5, 24.0, 80)])
    assert result[0].covered_population == 160
    assert result[0].allocated_population == 100


def test_processed_trajectory_matcher_uses_a7_features(tmp_path):
    feature_path = tmp_path / "features-64.json"
    points = [[index / 63, 0.0] for index in range(64)]
    feature_path.write_text(
        __import__("json").dumps(
            [
                {
                    "storm_id": "storm-1",
                    "points": points,
                    "shape_normalized": points,
                }
            ]
        ),
        encoding="utf-8",
    )
    matcher = ProcessedTrajectoryMatcher(feature_path)
    result = matcher.match(
        TrajectoryMatchRequest.model_validate(
            {
                "mode": "shape",
                "points": [{"lon": 0, "lat": 0}, {"lon": 1, "lat": 0}],
                "top_k": 1,
            }
        ),
        [
            {
                "id": "storm-1",
                "name": "TEST",
                "season": 2020,
                "basin": "WP",
                "impact_score": 1,
            }
        ],
    )
    assert result["items"][0]["storm_id"] == "storm-1"
    assert result["items"][0]["similarity"] == 1.0
    assert result["source_ids"] == ["ibtracs_since1980", "a7_track_features"]
