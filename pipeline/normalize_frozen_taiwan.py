#!/usr/bin/env python3
"""Create strict frozen-contract 2.1 Taiwan GeoJSON derivatives.

The source ADM1/facility files remain available as legacy inputs.  This script
only creates the API-facing derivatives with the exact frozen property names.
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
TAIWAN = ROOT / "output" / "processed" / "taiwan"
SOURCE_ZONES = TAIWAN / "zones.geojson"
LEGACY_ZONES = TAIWAN / "zones-legacy-adm1.geojson"
SOURCE_FACILITIES = TAIWAN / "facilities" / "facilities-all.geojson"
POP = TAIWAN / "population" / "zones-population-2025.parquet"
OFFICIAL = TAIWAN / "population" / "admin-official-population-spatial.parquet"

NAME_ZH = {
    "Hsinchu County": "新竹縣", "Miaoli County": "苗栗縣", "Matsu Islands": "連江縣",
    "Kinmen": "金門縣", "Chiayi County": "嘉義縣", "Hualien County": "花蓮縣",
    "Yilan County": "宜蘭縣", "Nantou County": "南投縣", "Pingtung County": "屏東縣",
    "Taitung County": "臺東縣", "Changhua County": "彰化縣", "Yunlin County": "雲林縣",
    "Keelung": "基隆市", "Hsinchu City": "新竹市", "Chiayi City": "嘉義市",
    "Taichung City": "臺中市", "Taipei City": "臺北市", "New Taipei City": "新北市",
    "Taoyuan City": "桃園市", "Tainan City": "臺南市", "Kaohsiung City": "高雄市",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def root_meta(status: str, source_ids: list[str]) -> dict:
    return {
        "type": "FeatureCollection",
        "schema_version": "1.0",
        "data_status": status,
        "source_ids": sorted(set(source_ids)),
        "generated_at": iso_now(),
    }


def normalize_zones() -> None:
    if not LEGACY_ZONES.exists():
        shutil.copy2(SOURCE_ZONES, LEGACY_ZONES)
    gdf = gpd.read_file(LEGACY_ZONES).to_crs("EPSG:4326")
    area = gdf.to_crs("EPSG:3826").geometry.area / 1_000_000
    centroids = gdf.to_crs("EPSG:3826").geometry.centroid.to_crs("EPSG:4326")
    pop = pd.read_parquet(POP).set_index("zone_id")
    off = pd.read_parquet(OFFICIAL).set_index("zone_id")
    features = []
    for idx, row in gdf.iterrows():
        zid = str(row["zone_id"])
        world = pop.loc[zid, "population_worldpop"] if zid in pop.index else None
        official = off.loc[zid, "population_official"] if zid in off.index else None
        ref = off.loc[zid, "reference_date"] if zid in off.index else None
        if pd.notna(official):
            population = int(round(float(official)))
            year = int(pd.Timestamp(ref).year) if pd.notna(ref) else 2024
            status = "observed"
            sources = ["taiwan_statistical_population_2024-12-01"]
        elif pd.notna(world):
            population = int(round(float(world)))
            year = 2025
            status = "modeled"
            sources = ["WorldPop_Global2_R2025A_2025"]
        else:
            population = None
            year = None
            status = "mixed"
            sources = []
        code = str(row["zone_code"])
        name = str(row["zone_name"])
        c = centroids.iloc[idx]
        props = {
            "zone_id": zid,
            "county_code": code,
            "town_code": None,
            "name_zh": NAME_ZH.get(name, name),
            "population": population,
            "population_year": year,
            "area_km2": round(float(area.iloc[idx]), 6),
            "centroid_lon": float(c.x),
            "centroid_lat": float(c.y),
            "source_ids": ["taiwan_adm1_boundary", *sources],
            "data_status": status,
        }
        features.append({"type": "Feature", "properties": props, "geometry": row.geometry.__geo_interface__})
    out = root_meta("mixed", ["taiwan_adm1_boundary", "taiwan_statistical_population_2024-12-01", "WorldPop_Global2_R2025A_2025"])
    out["features"] = features
    SOURCE_ZONES.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def normalize_facilities() -> None:
    gdf = gpd.read_file(SOURCE_FACILITIES).to_crs("EPSG:4326")
    zone_codes = gpd.read_file(LEGACY_ZONES)[["zone_id", "zone_code"]].astype({"zone_id": str}).set_index("zone_id")["zone_code"].to_dict()
    features = []
    source_ids: list[str] = []
    for _, row in gdf.iterrows():
        kind = str(row.get("facility_type") or "").lower()
        kind = "medical" if kind == "medical" else "shelter" if kind == "shelter" else "rescue" if kind == "rescue" else "warehouse"
        raw_cap = row.get("capacity_value")
        try:
            cap = float(raw_cap) if pd.notna(raw_cap) and str(raw_cap).strip() else None
            if cap is not None and cap.is_integer():
                cap = int(cap)
        except (TypeError, ValueError):
            cap = None
        sid = str(row.get("source_dataset") or "taiwan_facilities")
        source_ids.append(sid)
        address = row.get("address")
        if pd.isna(address):
            address = None
        zid = str(row.get("zone_id")) if pd.notna(row.get("zone_id")) else None
        props = {
            "facility_id": str(row["facility_id"]),
            "name": str(row.get("name") or ""),
            "type": kind,
            "capacity_value": cap,
            "capacity_unit": str(row.get("capacity_unit")) if pd.notna(row.get("capacity_unit")) else None,
            "service_radius_km": 10.0,
            "budget_points": None,
            "address": address,
            "county_code": zone_codes.get(zid),
            "is_simulated": False,
            "source_ids": [sid, "service_radius_scenario_10km"],
            "data_status": "mixed",
        }
        geom = row.geometry.__geo_interface__
        if geom.get("type") != "Point":
            continue
        features.append({"type": "Feature", "properties": props, "geometry": geom})
    out = root_meta("mixed", sorted(set(source_ids + ["service_radius_scenario_10km"])))
    out["features"] = features
    (TAIWAN / "facilities.geojson").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    normalize_zones()
    normalize_facilities()
    print("wrote", TAIWAN / "zones.geojson", "and", TAIWAN / "facilities.geojson")
