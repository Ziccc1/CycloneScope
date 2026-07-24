"""Process the official IBTrACS CSV (two header rows, units row included)."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from clean_storms import clean_track, write_outputs


WIND_COLUMNS = ("WMO_WIND", "USA_WIND", "CMA_WIND", "HKO_WIND", "KMA_WIND", "TOKYO_WIND")
PRESSURE_COLUMNS = ("WMO_PRES", "USA_PRES", "CMA_PRES", "HKO_PRES", "KMA_PRES", "TOKYO_PRES")


def text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value if value and value not in {"N/A", "-999", "-999.0"} else None


def number(value: str | None) -> float | None:
    value = text(value)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def pick(row: dict[str, str], names: tuple[str, ...]) -> tuple[float | None, str | None]:
    for name in names:
        value = number(row.get(name))
        if value is not None:
            return value, name
    return None, None


def load_ibtracs(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle))
    header_index = next(i for i, row in enumerate(rows) if row and row[0].strip() == "SID")
    headers = [cell.strip() for cell in rows[header_index]]
    grouped: dict[str, dict[str, Any]] = {}
    for raw in rows[header_index + 2 :]:  # skip the units row
        if len(raw) < len(headers):
            raw += [""] * (len(headers) - len(raw))
        row = dict(zip(headers, raw))
        storm_id = text(row.get("SID"))
        timestamp = text(row.get("ISO_TIME"))
        if not storm_id or not timestamp:
            continue
        item = grouped.setdefault(storm_id, {
            "id": storm_id,
            "name": text(row.get("NAME")) or "UNNAMED",
            "season": int(float(row.get("SEASON") or 0)),
            "basin": text(row.get("BASIN")) or "WP",
            "track": [],
            "data_status": "observed",
            "source_ids": ["ibtracs"],
            "classic": False,
            "classic_rank": None,
            "impact_score": None,
            "score_coverage": 0,
            "landfall_count": 0,
            "wind_available": False,
            "impact_available": False,
        })
        wind_knots, wind_source = pick(row, WIND_COLUMNS)
        pressure, pressure_source = pick(row, PRESSURE_COLUMNS)
        point = {
            "time": timestamp,
            "lon": row.get("LON"),
            "lat": row.get("LAT"),
            "wind_ms": round(wind_knots * 0.514444, 4) if wind_knots is not None else None,
            "pressure_hpa": pressure,
            "category": text(row.get("USA_SSHS")),
            "storm_status": text(row.get("NATURE")),
            "source_agency": wind_source or pressure_source,
        }
        item["track"].append(point)
    records = []
    for item in grouped.values():
        track, warnings = clean_track(item.pop("track"))
        if not track:
            continue
        item["start_time"] = track[0]["time"]
        item["end_time"] = track[-1]["time"]
        winds = [point["wind_ms"] for point in track if point["wind_ms"] is not None]
        pressures = [point["pressure_hpa"] for point in track if point["pressure_hpa"] is not None]
        item["max_wind_ms"] = max(winds) if winds else None
        item["min_pressure_hpa"] = min(pressures) if pressures else None
        item["wind_available"] = bool(winds)
        item["duration_hours"] = 0  # normalize_sample-style summary is filled below
        from clean_storms import normalize_sample
        normalized = normalize_sample([{**item, "track": track}])[0]
        normalized["warnings"] = sorted(set(warnings + normalized["warnings"]))
        records.append(normalized)
    return records


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    records = load_ibtracs(args.input)
    write_outputs(records, args.output)
    print(json.dumps({"input": str(args.input), "records": len(records), "output": str(args.output)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
