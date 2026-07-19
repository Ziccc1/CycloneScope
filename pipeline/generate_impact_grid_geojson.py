#!/usr/bin/env python3
"""Create contract-compliant event hazard grids for storms with ERA5 hazard points."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "processed"
HAZARD = OUT / "impact" / "hazard" / "taiwan-hazard-max-wind-16.parquet"
CATALOG = OUT / "ibtracs-global-since1980" / "catalog" / "storms.parquet"
DEST = OUT / "impact" / "storms"


def iso(value) -> str:
    t = pd.Timestamp(value)
    t = t.tz_localize("UTC") if t.tzinfo is None else t.tz_convert("UTC")
    return t.isoformat().replace("+00:00", "Z")


def square(lon: float, lat: float, half: float = 0.25) -> list[list[float]]:
    return [[lon-half, lat-half], [lon+half, lat-half], [lon+half, lat+half], [lon-half, lat+half], [lon-half, lat-half]]


def main() -> None:
    hazard = pd.read_parquet(HAZARD)
    catalog = pd.read_parquet(CATALOG).set_index("id")
    generated = pd.Timestamp.now(tz="UTC").floor("s").isoformat().replace("+00:00", "Z")
    total = 0
    for storm_id, group in hazard.groupby("storm_id", sort=True):
        if storm_id not in catalog.index:
            continue
        row = catalog.loc[storm_id]
        start, end = iso(row["start_time"]), iso(row["end_time"])
        features = []
        for idx, point in group.reset_index(drop=True).iterrows():
            value = float(point["max_speed_ms"]) if pd.notna(point["max_speed_ms"]) else None
            props = {
                "cell_id": f"{storm_id}-{idx:04d}",
                "time_start": start,
                "time_end": end,
                "hazard_index": round(min(value / 50.0, 1.0), 6) if value is not None else None,
                "max_wind_ms": value,
                "precip_mm": None,
                "population": None,
                "exposed_population": None,
                "reported_damage_usd": None,
                "reported_damage_price_year": None,
                "contributing_storm_ids": [str(storm_id)],
                "data_status": "reanalysis",
                "source_ids": ["era5", "ibtracs"],
            }
            lon, lat = float(point["longitude"]), float(point["latitude"])
            features.append({"type": "Feature", "id": props["cell_id"], "geometry": {"type": "Polygon", "coordinates": [square(lon, lat)]}, "properties": props})
        out = {
            "type": "FeatureCollection",
            "schema_version": "1.0",
            "data_status": "reanalysis",
            "source_ids": ["era5", "ibtracs"],
            "generated_at": generated,
            "metric": "max_wind_ms",
            "features": features,
        }
        target = DEST / str(storm_id)
        target.mkdir(parents=True, exist_ok=True)
        (target / "grid.geojson").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        total += len(features)
    print("generated", total, "features for", hazard.storm_id.nunique(), "storms")


if __name__ == "__main__":
    main()
