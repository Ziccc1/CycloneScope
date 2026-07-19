"""Prepare ERA5 requests split by storm and calendar month."""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path


FULL_ANIMATION = [
    "2009215N20133", "1996203N12152", "2010256N17137", "2015211N13162",
    "2013306N07162", "2005236N23285", "2015293N13266", "2019063S18038",
]
STATIC_COMPARISON = ["1980214N11330", "2019236N10314", "2008117N11090", "2023036S12117"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--classic", type=Path, required=True)
    parser.add_argument("--tracks", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    classic = {item["id"]: item for item in json.loads(args.classic.read_text(encoding="utf-8"))["items"]}
    track_by_id: dict[str, list[dict]] = defaultdict(list)
    for line in (args.tracks / "track-points.jsonl").read_text(encoding="utf-8").splitlines():
        point = json.loads(line)
        track_by_id[point["storm_id"]].append(point)
    requests = []
    for mode, ids in (("full_animation", FULL_ANIMATION), ("static_comparison", STATIC_COMPARISON)):
        for storm_id in ids:
            item = classic[storm_id]
            points = track_by_id[storm_id]
            grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
            for point in points:
                grouped[(point["time"][:4], point["time"][5:7])].append(point)
            lats = [p["lat"] for p in points]
            lons = [p["lon"] for p in points]
            area = [round(min(90.0, max(lats) + 12), 2), round(max(-180.0, min(lons) - 12), 2),
                    round(max(-90.0, min(lats) - 12), 2), round(min(180.0, max(lons) + 12), 2)]
            for (year, month), month_points in sorted(grouped.items()):
                days = sorted({p["time"][8:10] for p in month_points})
                requests.append({
                    "storm_id": storm_id, "name": item["name"], "mode": mode,
                    "year": [year], "month": [month], "day": days,
                    "time": ["00:00", "06:00", "12:00", "18:00"],
                    "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
                    "area": area, "grid": [0.5, 0.5], "format": "netcdf",
                })
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"count": len(requests), "requests": requests}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"request_count": len(requests), "storms": len(set(r["storm_id"] for r in requests))}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
