#!/usr/bin/env python3
"""Export a strict StormCatalogResponse-shaped JSON from the A catalog Parquet."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "processed" / "ibtracs-global-since1980" / "catalog" / "storms.parquet"
DEST = ROOT / "output" / "processed" / "catalog" / "storms-summary.json"

FIELDS = [
    "id", "name", "season", "basin", "start_time", "end_time", "max_wind_ms", "min_pressure_hpa",
    "duration_hours", "ace", "landfall_count", "classic", "classic_rank", "impact_score", "score_coverage",
    "reported_deaths", "reported_damage_usd_2024", "wind_available", "impact_available", "data_status", "source_ids",
]


def clean(value):
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        t = value.tz_localize("UTC") if value.tzinfo is None else value.tz_convert("UTC")
        return t.isoformat().replace("+00:00", "Z")
    if hasattr(value, "item"):
        return value.item()
    return value


def main() -> None:
    df = pd.read_parquet(SOURCE)
    items = []
    for _, row in df.iterrows():
        item = {field: clean(row[field]) for field in FIELDS}
        item["id"] = str(item["id"])
        item["name"] = str(item["name"])
        item["season"] = int(item["season"])
        item["basin"] = str(item["basin"])
        raw_source_ids = item["source_ids"]
        if isinstance(raw_source_ids, str):
            item["source_ids"] = [raw_source_ids]
        elif raw_source_ids is None:
            item["source_ids"] = []
        else:
            item["source_ids"] = [str(x) for x in raw_source_ids]
        items.append(item)
    out = {
        "schema_version": "1.0",
        "data_status": "observed",
        "source_ids": ["ibtracs_since1980"],
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "items": items,
        "count": len(items),
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("wrote", DEST, len(items))


if __name__ == "__main__":
    main()
