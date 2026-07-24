from __future__ import annotations


def test_health_and_data_sources(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["database"] == "sqlite"
    assert health.json()["data_mode"] == "fixture"
    assert health.json()["data_status"] == "synthetic_fixture"

    sources = client.get("/api/data-sources")
    assert sources.status_code == 200
    source_ids = {item["id"] for item in sources.json()["items"]}
    assert {"ibtracs", "era5", "emdat", "tce-dat"}.issubset(source_ids)


def test_storm_catalog_track_impact_and_wind_fixture(client):
    response = client.get("/api/storms", params={"classic": "true", "basin": "WP"})
    assert response.status_code == 200
    assert response.json()["count"] == 2
    assert response.json()["schema_version"] == "1.0"
    assert "season" in response.json()["items"][0]
    assert "year" not in response.json()["items"][0]

    storm_id = response.json()["items"][0]["id"]
    assert client.get(f"/api/storms/{storm_id}").status_code == 200
    assert client.get(f"/api/storms/{storm_id}/track").json()["points"]
    assert "warning" in client.get(f"/api/storms/{storm_id}/impact/summary").json()

    manifest = client.get(f"/api/storms/{storm_id}/wind/manifest")
    assert manifest.status_code == 200
    assert manifest.json()["grid_order"] == "north_to_south_west_to_east_row_major"
    frame = client.get(manifest.json()["frames"][0]["url"])
    assert frame.status_code == 200
    assert len(frame.json()["u"]) == frame.json()["width"] * frame.json()["height"]
    assert len(frame.json()["v"]) == frame.json()["width"] * frame.json()["height"]


def test_missing_storm_returns_404(client):
    response = client.get("/api/storms/not-a-storm")
    assert response.status_code == 404


def test_scenario_facility_and_evaluation_flow(client):
    scenario = client.post("/api/scenarios", json={"name": "台湾东部避难设施测试"})
    assert scenario.status_code == 201
    scenario_id = scenario.json()["id"]

    facility = client.post(
        f"/api/scenarios/{scenario_id}/facilities",
        json={
            "type": "shelter",
            "lon": 121.6,
            "lat": 24.0,
            "capacity_value": 500,
            "capacity_unit": "people",
            "service_radius_km": 5,
            "budget_points": 3
        },
    )
    assert facility.status_code == 201
    assert facility.json()["is_simulated"] is True

    evaluation = client.post(
        f"/api/scenarios/{scenario_id}/evaluate",
        json={"at_risk_population": 1000},
    )
    assert evaluation.status_code == 200
    body = evaluation.json()
    assert body["modeled_covered_population"] == 500
    assert body["modeled_uncovered_population"] == 500
    assert body["total_budget_points"] == 3
    assert body["data_status"] == "scenario_model"


def test_facility_type_defaults_are_applied_by_contract(client):
    scenario = client.post("/api/scenarios", json={"name": "医疗设施默认值"})
    scenario_id = scenario.json()["id"]

    facility = client.post(
        f"/api/scenarios/{scenario_id}/facilities",
        json={"type": "medical", "lon": 121.5, "lat": 25.0},
    )
    assert facility.status_code == 201
    body = facility.json()
    assert body["capacity_value"] == 50
    assert body["capacity_unit"] == "beds"
    assert body["service_radius_km"] == 15
    assert body["budget_points"] == 5


def test_facility_rejects_mismatched_capacity_unit(client):
    scenario = client.post("/api/scenarios", json={"name": "非法单位"})
    scenario_id = scenario.json()["id"]
    response = client.post(
        f"/api/scenarios/{scenario_id}/facilities",
        json={
            "type": "medical",
            "lon": 121.5,
            "lat": 25.0,
            "capacity_value": 100,
            "capacity_unit": "people",
        },
    )
    assert response.status_code == 422


def test_extended_storm_filters_and_track_window(client):
    response = client.get(
        "/api/storms",
        params={
            "season_from": 2009,
            "season_to": 2013,
            "min_wind_ms": 80,
            "landfall": "true",
        },
    )
    assert response.status_code == 200
    assert [item["name"] for item in response.json()["items"]] == ["HAIYAN"]

    invalid_range = client.get(
        "/api/storms", params={"season_from": 2020, "season_to": 2000}
    )
    assert invalid_range.status_code == 422

    track = client.get(
        "/api/storms/demo-morakot-2009/track",
        params={
            "start": "2009-08-06T00:00:00Z",
            "end": "2009-08-07T12:00:00Z",
        },
    )
    assert track.status_code == 200
    assert len(track.json()["points"]) == 1


def test_impact_taiwan_and_period_fixture_queries(client):
    impact = client.get(
        "/api/impact/grid",
        params={"hazard_threshold": 0.8, "bbox": "120,22,121,23"},
    )
    assert impact.status_code == 200
    assert len(impact.json()["features"]) == 2
    assert all(
        item["properties"]["data_status"] == "synthetic_fixture"
        for item in impact.json()["features"]
    )

    zones = client.get("/api/taiwan/zones", params={"county_code": "HUA"})
    assert zones.status_code == 200
    assert len(zones.json()["features"]) == 1

    facilities = client.get(
        "/api/taiwan/facilities",
        params={"type": "medical", "county_code": "KHH"},
    )
    assert facilities.status_code == 200
    assert len(facilities.json()["features"]) == 1
    assert (
        client.get("/api/taiwan/facilities", params={"type": "airport"}).status_code
        == 422
    )

    period = client.get("/api/wind/periods/demo-global/manifest")
    assert period.status_code == 200
    assert period.json()["mode"] == "global"
    assert client.get("/api/wind/periods/missing/manifest").status_code == 404


def test_fixture_trajectory_wrapper_validates_and_filters(client):
    response = client.post(
        "/api/trajectory-match",
        json={
            "mode": "shape",
            "points": [{"lon": 130, "lat": 15}, {"lon": 122, "lat": 23}],
            "filters": {"basins": ["WP"], "season_from": 2000, "season_to": 2020},
            "top_k": 1,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data_status"] == "algorithmic_result"
    assert len(body["items"]) == 1
    assert body["items"][0]["rank"] == 1
    assert "Fixture" in body["items"][0]["explanation"]

    invalid = client.post(
        "/api/trajectory-match",
        json={
            "mode": "geographic",
            "points": [{"lon": 120, "lat": 20}],
        },
    )
    assert invalid.status_code == 422


def test_full_scenario_and_facility_crud(client):
    created = client.post("/api/scenarios", json={"name": "CRUD scenario"})
    scenario_id = created.json()["id"]
    facility = client.post(
        f"/api/scenarios/{scenario_id}/facilities",
        json={"type": "shelter", "lon": 121.5, "lat": 24.0},
    )
    facility_id = facility.json()["id"]

    detail = client.get(f"/api/scenarios/{scenario_id}")
    assert detail.status_code == 200
    assert len(detail.json()["facilities"]) == 1

    renamed = client.patch(
        f"/api/scenarios/{scenario_id}", json={"name": "Renamed scenario"}
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed scenario"

    moved = client.patch(
        f"/api/scenarios/{scenario_id}/facilities/{facility_id}",
        json={"lon": 121.7, "lat": 24.2},
    )
    assert moved.status_code == 200
    assert moved.json()["lon"] == 121.7

    changed_type = client.patch(
        f"/api/scenarios/{scenario_id}/facilities/{facility_id}",
        json={"type": "medical"},
    )
    assert changed_type.status_code == 200
    assert changed_type.json()["capacity_unit"] == "beds"
    assert changed_type.json()["capacity_value"] == 50

    assert (
        client.patch(
            f"/api/scenarios/{scenario_id}/facilities/{facility_id}", json={}
        ).status_code
        == 422
    )
    assert (
        client.delete(
            f"/api/scenarios/not-this-scenario/facilities/{facility_id}"
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/scenarios/{scenario_id}/facilities/{facility_id}"
        ).status_code
        == 204
    )
    assert client.delete(f"/api/scenarios/{scenario_id}").status_code == 204
    assert client.get(f"/api/scenarios/{scenario_id}").status_code == 404
