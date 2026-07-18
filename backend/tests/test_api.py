from __future__ import annotations


def test_health_and_data_sources(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["database"] == "sqlite"

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
