#!/usr/bin/env python3
"""Validate A-side artifacts against CycloneScope frozen data contract 2.1."""

from __future__ import annotations

import gzip
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "processed"
REQUIRED_TRACK = {
    "storm_id", "time", "lon", "lat", "wind_ms", "pressure_hpa", "category",
    "storm_status", "moving_speed_kmh", "is_landfall", "source_agency",
}
REQUIRED_CATALOG = {
    "id", "name", "season", "basin", "start_time", "end_time", "max_wind_ms",
    "min_pressure_hpa", "duration_hours", "ace", "landfall_count", "classic",
    "classic_rank", "impact_score", "score_coverage", "reported_deaths",
    "reported_damage_usd_2024", "wind_available", "impact_available", "data_status",
    "source_ids",
}
STATUS = {"observed", "reanalysis", "reported", "modeled", "mixed", "synthetic_fixture", "synthetic_demo", "algorithmic_result", "scenario_model"}


def check(name: str, ok: bool, detail: str = "") -> dict:
    return {"name": name, "status": "pass" if ok else "fail", "detail": detail}


def main() -> int:
    results: list[dict] = []
    classic_path = OUT / "classic" / "classic-storms.json"
    classic = json.loads(classic_path.read_text(encoding="utf-8-sig"))
    meta = {"schema_version", "data_status", "source_ids", "generated_at"}
    results.append(check("classic.root_metadata", meta <= classic.keys(), str(sorted(meta - classic.keys()))))
    results.append(check("classic.status_enum", classic.get("data_status") in STATUS, str(classic.get("data_status"))))
    results.append(check("classic.count", classic.get("count") == len(classic.get("items", [])), f"count={classic.get('count')} items={len(classic.get('items', []))}"))
    results.append(check("classic.16_cases", classic.get("count") == 16, str(classic.get("count"))))

    for scope in ("ibtracs-global-since1980", "ibtracs-wp-since1980", "ibtracs-wp"):
        track_path = OUT / scope / "tracks" / "track-points.parquet"
        cat_path = OUT / scope / "catalog" / "storms.parquet"
        if not track_path.exists() or not cat_path.exists():
            results.append(check(f"{scope}.files", False, "track or catalog parquet missing"))
            continue
        track = pd.read_parquet(track_path)
        cat = pd.read_parquet(cat_path)
        missing_track = sorted(REQUIRED_TRACK - set(track.columns))
        missing_cat = sorted(REQUIRED_CATALOG - set(cat.columns))
        results.append(check(f"{scope}.track_fields", not missing_track, str(missing_track)))
        results.append(check(f"{scope}.catalog_fields", not missing_cat, str(missing_cat)))
        times = pd.to_datetime(track["time"], utc=True, errors="coerce")
        results.append(check(f"{scope}.track_time_utc", not times.isna().any(), f"null={int(times.isna().sum())}"))
        results.append(check(f"{scope}.coordinates", bool(track["lon"].between(-180, 180).all() and track["lat"].between(-90, 90).all()), "range check"))
        bad_order = 0
        for _, g in track.assign(_time=times).groupby("storm_id", sort=False):
            bad_order += int((g["_time"].diff().dropna() <= pd.Timedelta(0)).sum())
        results.append(check(f"{scope}.track_order", bad_order == 0, f"non-increasing={bad_order}"))
        results.append(check(f"{scope}.landfall_nullable", "is_landfall" in track.columns, "nullable field present"))
        results.append(check(f"{scope}.catalog_status_enum", set(cat["data_status"].dropna().astype(str)) <= STATUS, "enum check"))

    manifest_path = OUT / "era5" / "downloads" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    results.append(check("era5.download_manifest_present", bool(manifest.get("files")), f"files={len(manifest.get('files', []))}"))
    frame_files = list((OUT / "era5" / "wind").rglob("*.json.gz"))
    wind_manifests = list((OUT / "era5" / "wind").rglob("manifest.json"))
    results.append(check("era5.contract_frames", bool(frame_files) and bool(wind_manifests), f"manifests={len(wind_manifests)} frames={len(frame_files)}"))
    bad_frames = 0
    for mf in wind_manifests:
        m = json.loads(mf.read_text(encoding="utf-8-sig"))
        if not {"schema_version", "data_status", "source_ids", "generated_at", "dataset_id", "mode", "units", "grid_order", "bounds", "resolution_degrees", "width", "height", "frames"} <= m.keys():
            bad_frames += 1
        for ref in m.get("frames", []):
            fp = OUT / "era5" / ref["url"]
            if not fp.exists():
                bad_frames += 1
                continue
            with gzip.open(fp, "rt", encoding="utf-8") as fh:
                frame = json.load(fh)
            if not {"schema_version", "dataset_id", "time", "width", "height", "u", "v", "missing_value"} <= frame.keys() or len(frame.get("u", [])) != int(frame.get("width", 0)) * int(frame.get("height", 0)) or len(frame.get("v", [])) != int(frame.get("width", 0)) * int(frame.get("height", 0)):
                bad_frames += 1
    results.append(check("era5.frame_array_lengths", bad_frames == 0, f"invalid manifests/frames={bad_frames}"))

    zones_path = OUT / "taiwan" / "zones.geojson"
    facilities_path = OUT / "taiwan" / "facilities.geojson"
    zones = json.loads(zones_path.read_text(encoding="utf-8-sig")) if zones_path.exists() else {}
    facilities = json.loads(facilities_path.read_text(encoding="utf-8-sig")) if facilities_path.exists() else {}
    zone_fields = {"zone_id", "county_code", "town_code", "name_zh", "population", "population_year", "area_km2", "centroid_lon", "centroid_lat", "source_ids", "data_status"}
    fac_fields = {"facility_id", "name", "type", "capacity_value", "capacity_unit", "service_radius_km", "budget_points", "address", "county_code", "is_simulated", "source_ids", "data_status"}
    zprops = set((zones.get("features") or [{}])[0].get("properties", {}))
    fprops = set((facilities.get("features") or [{}])[0].get("properties", {}))
    results.append(check("taiwan.zones_contract_fields", zone_fields <= zprops, str(sorted(zone_fields - zprops))))
    results.append(check("taiwan.facilities_contract_fields", fac_fields <= fprops, str(sorted(fac_fields - fprops))))

    impact_grids = list((OUT / "impact").glob("storms/*/grid.geojson")) + list((OUT / "impact").glob("windows/*/grid.geojson"))
    results.append(check("impact.grid_contract", bool(impact_grids), f"grid_files={len(impact_grids)}; unavailable cases must return impact_available=false"))
    bad_grids = 0
    for gp in impact_grids:
        g = json.loads(gp.read_text(encoding="utf-8-sig"))
        if not {"type", "schema_version", "data_status", "source_ids", "generated_at", "metric", "features"} <= g.keys():
            bad_grids += 1
        for f in g.get("features", []):
            if not {"cell_id", "time_start", "time_end", "hazard_index", "max_wind_ms", "precip_mm", "population", "exposed_population", "reported_damage_usd", "reported_damage_price_year", "contributing_storm_ids", "data_status", "source_ids"} <= set(f.get("properties", {})):
                bad_grids += 1
    results.append(check("impact.grid_fields", bad_grids == 0, f"invalid grid files/features={bad_grids}"))

    passed = sum(r["status"] == "pass" for r in results)
    failed = len(results) - passed
    known_limits = []
    if len(impact_grids) < int(classic.get("count", 0)):
        known_limits.append(f"impact_grid_coverage={len(impact_grids)}/{classic.get('count', 0)}_classic_cases")
    if not frame_files:
        known_limits.append("era5_contract_frames_missing")
    report = {
        "schema_version": "1.0",
        "data_status": "mixed",
        "source_ids": ["ibtracs", "era5", "worldpop", "emdat", "tce_dat", "taiwan_official", "taiwan_shelters_73242", "taiwan_medical_139250", "taiwan_rescue_units_5969", "taiwan_emergency_centers_5969", "osm"],
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "contract_version": "2.1",
        "data_version": "a8-final-2026.07.19",
        "status": "fail" if failed else ("pass_with_known_coverage_limits" if known_limits else "pass"),
        "known_limits": known_limits,
        "passed": passed,
        "failed": failed,
        "results": results,
    }
    qa_dir = ROOT / "output" / "qa"
    qa_dir.mkdir(parents=True, exist_ok=True)
    (qa_dir / "frozen-contract-2.1-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md = ["# 冻结数据契约 2.1 机器审计", "", f"状态：`{report['status']}`；通过 {passed} 项，未通过 {failed} 项。", "", "| 检查 | 状态 | 说明 |", "|---|---|---|"]
    md += [f"| `{r['name']}` | `{r['status']}` | {r['detail']} |" for r in results]
    (qa_dir / "frozen-contract-2.1-validation.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
