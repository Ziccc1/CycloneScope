#!/usr/bin/env python3
"""Normalize Taiwan government rescue/emergency-center dataset 5969."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "input" / "raw" / "taiwan" / "facilities"
OUT = ROOT / "output" / "processed" / "taiwan"
LEGACY_ZONES = OUT / "zones-legacy-adm1.geojson"
CONTRACT = OUT / "facilities.geojson"


def source_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def county_code(point: Point, zones: gpd.GeoDataFrame) -> str | None:
    for _, zone in zones.iterrows():
        if zone.geometry.covers(point):
            return str(zone.zone_code)
    return None


def feature(fid: str, name: str, address, lon: float, lat: float, code: str | None, source: str) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "facility_id": fid,
            "name": name,
            "type": "rescue",
            "capacity_value": None,
            "capacity_unit": None,
            "service_radius_km": 10.0,
            "budget_points": None,
            "address": None if pd.isna(address) else str(address),
            "county_code": code,
            "is_simulated": False,
            "source_ids": [source, "service_radius_scenario_10km"],
            "data_status": "mixed",
        },
    }


def main() -> None:
    zones = gpd.read_file(LEGACY_ZONES).to_crs("EPSG:4326")
    rows: list[dict] = []
    normalized: list[dict] = []
    rescue_path = RAW / "rescue-units-5969.csv"
    rescue = pd.read_csv(rescue_path, encoding="cp950")
    rescue["lon"] = pd.to_numeric(rescue["X座標_TWD97TM121"], errors="coerce")
    rescue["lat"] = pd.to_numeric(rescue["Y座標_TWD97TM121"], errors="coerce")
    rescue = rescue.dropna(subset=["消防隊名稱", "lon", "lat"])
    rescue = rescue[rescue.lon.between(118, 123.5) & rescue.lat.between(20, 27)]
    for idx, r in rescue.reset_index(drop=True).iterrows():
        fid = f"rescue-5969-{idx + 1:04d}"
        code = county_code(Point(float(r.lon), float(r.lat)), zones)
        normalized.append(feature(fid, str(r["消防隊名稱"]), r.get("地址"), float(r.lon), float(r.lat), code, "taiwan_rescue_units_5969"))
        rows.append({"facility_id": fid, "facility_type": "rescue", "source_dataset": "taiwan_rescue_units_5969", "name": str(r["消防隊名稱"]), "address": r.get("地址"), "phone": r.get("聯絡電話"), "longitude": float(r.lon), "latitude": float(r.lat), "county_code": code, "data_status": "mixed"})
    center_path = RAW / "emergency-centers-5969.csv"
    centers = pd.read_csv(center_path, encoding="utf-8-sig")
    centers["lon"] = pd.to_numeric(centers["經度"], errors="coerce")
    centers["lat"] = pd.to_numeric(centers["緯度"], errors="coerce")
    centers = centers.dropna(subset=["名稱", "lon", "lat"])
    centers = centers[centers.lon.between(118, 123.5) & centers.lat.between(20, 27)]
    for idx, r in centers.reset_index(drop=True).iterrows():
        fid = f"emergency-center-5969-{idx + 1:04d}"
        code = county_code(Point(float(r.lon), float(r.lat)), zones)
        normalized.append(feature(fid, str(r["名稱"]), r.get("地址"), float(r.lon), float(r.lat), code, "taiwan_emergency_centers_5969"))
        rows.append({"facility_id": fid, "facility_type": "rescue", "source_dataset": "taiwan_emergency_centers_5969", "name": str(r["名稱"]), "address": r.get("地址"), "phone": r.get("電話"), "same_location": r.get("是否與消防局同位置"), "longitude": float(r.lon), "latitude": float(r.lat), "county_code": code, "data_status": "mixed"})

    out_dir = OUT / "facilities"
    out_dir.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_parquet(out_dir / "rescue-facilities.parquet", index=False)
    for raw in [rescue_path, center_path]:
        pass
    existing = json.loads(CONTRACT.read_text(encoding="utf-8-sig"))
    existing["generated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    existing["source_ids"] = sorted(set(existing.get("source_ids", [])) | {"taiwan_rescue_units_5969", "taiwan_emergency_centers_5969", "service_radius_scenario_10km"})
    existing["features"].extend(normalized)
    CONTRACT.write_text(json.dumps(existing, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    qa = {
        "schema_version": "1.0", "data_status": "mixed", "source_ids": ["taiwan_rescue_units_5969", "taiwan_emergency_centers_5969"],
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "dataset_id": "taiwan_facilities_5969", "rescue_unit_count": len(rescue), "emergency_center_count": len(centers),
        "output_count": len(normalized), "coordinate_range_check": True, "county_match_count": sum(bool(x["properties"]["county_code"]) for x in normalized),
        "source_files": [{"path": str(p.relative_to(ROOT)).replace("\\", "/"), "sha256": source_hash(p), "license": "政府資料開放授權條款-第1版"} for p in [rescue_path, center_path]],
        "service_radius_note": "10.0 km is a scenario display radius; not real-time travel time.",
    }
    (out_dir / "rescue-5969-qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("normalized", len(normalized), "rescue/emergency facilities")


if __name__ == "__main__":
    main()
