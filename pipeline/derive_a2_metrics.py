"""Add A2 derived ACE and landfall metrics to the real IBTrACS outputs."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import pandas as pd


def landfalls(raw_path: Path) -> dict[str, int]:
    with raw_path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle))
    header_index = next(i for i, row in enumerate(rows) if row and row[0].strip() == "SID")
    headers = [cell.strip() for cell in rows[header_index]]
    result: dict[str, int] = {}
    previous: dict[str, float | None] = {}
    for raw in rows[header_index + 2 :]:
        if len(raw) < len(headers):
            raw += [""] * (len(headers) - len(raw))
        row = dict(zip(headers, raw))
        sid = row.get("SID", "").strip()
        if not sid:
            continue
        value = row.get("LANDFALL", "").strip()
        try:
            distance = float(value)
        except ValueError:
            distance = None
        before = previous.get(sid)
        if distance is not None and distance <= 0 and (before is None or before > 0):
            result[sid] = result.get(sid, 0) + 1
        previous[sid] = distance
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--processed", type=Path, required=True)
    args = parser.parse_args()
    track = pd.read_parquet(args.processed / "tracks" / "track-points.parquet")
    track["time"] = pd.to_datetime(track["time"], utc=True)
    # Standard ACE uses six-hourly wind observations at or above 34 kt.
    six_hour = track[track["time"].dt.hour.isin([0, 6, 12, 18]) & track["wind_ms"].notna()].copy()
    six_hour["wind_kt"] = six_hour["wind_ms"] / 0.514444
    six_hour = six_hour[six_hour["wind_kt"] >= 34]
    ace = six_hour.groupby("storm_id")["wind_kt"].apply(lambda values: float((values ** 2).sum() / 10000)).to_dict()
    landfall = landfalls(args.raw)
    summary_path = args.processed / "catalog" / "storms-summary.json"
    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    for item in payload["items"]:
        sid = item["id"]
        item["ace"] = round(ace[sid], 4) if sid in ace else None
        item["landfall_count"] = landfall.get(sid, 0)
    summary_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    catalog = pd.DataFrame(payload["items"])
    catalog["start_time"] = pd.to_datetime(catalog["start_time"], utc=True)
    catalog["end_time"] = pd.to_datetime(catalog["end_time"], utc=True)
    catalog.to_parquet(args.processed / "catalog" / "storms.parquet", index=False)
    qa = {
        "record_count": len(catalog),
        "ace_non_null_count": int(catalog["ace"].notna().sum()),
        "landfall_positive_count": int((catalog["landfall_count"] > 0).sum()),
        "ace_definition": "sum(six-hourly wind_kt^2)/10000 for wind >= 34 kt",
        "landfall_definition": "transition into LANDFALL <= 0 km in IBTrACS",
        "sample_cases": ["2013306N07162", "2009215N20133", "2018250N12170"],
    }
    (args.processed / "qa" / "a2-derived-metrics.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(qa, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
