"""Prepare reproducible ERA5 requests for the selected classic storms."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


FULL_ANIMATION = [
    "2009215N20133", "1996203N12152", "2010256N17137", "2015211N13162",
    "2013306N07162", "2005236N23285", "2015293N13266", "2019063S18038",
]
STATIC_COMPARISON = ["1980214N11330", "2019236N10314", "2008117N11090", "2023036S12117"]


def request_for(item: dict, track_by_id: dict[str, list[dict]], mode: str) -> dict:
    points = track_by_id[item["id"]]
    lats = [point["lat"] for point in points]
    lons = [point["lon"] for point in points]
    west = max(-180.0, min(lons) - 12)
    east = min(180.0, max(lons) + 12)
    south = max(-90.0, min(lats) - 12)
    north = min(90.0, max(lats) + 12)
    start = item["start_time"][:10]
    end = item["end_time"][:10]
    days = sorted({point["time"][:10][-2:] for point in points})
    hours = ["00:00", "06:00", "12:00", "18:00"]
    return {
        "storm_id": item["id"],
        "name": item["name"],
        "mode": mode,
        "year": [start[:4]],
        "month": sorted({start[5:7], end[5:7]}),
        "day": days,
        "time": hours,
        "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
        "area": [round(north, 2), round(west, 2), round(south, 2), round(east, 2)],
        "grid": [0.5, 0.5],
        "format": "netcdf",
        "note": "Request is a candidate; after CDS response, subset exact track window and validate timestamps.",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--classic", type=Path, required=True)
    parser.add_argument("--tracks", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    classic = json.loads(args.classic.read_text(encoding="utf-8"))["items"]
    selected = {item["id"]: item for item in classic}
    track_by_id: dict[str, list[dict]] = {}
    for line in (args.tracks / "track-points.jsonl").read_text(encoding="utf-8").splitlines():
        point = json.loads(line)
        track_by_id.setdefault(point["storm_id"], []).append(point)
    requests = []
    for storm_id in FULL_ANIMATION:
        requests.append(request_for(selected[storm_id], track_by_id, "full_animation"))
    for storm_id in STATIC_COMPARISON:
        requests.append(request_for(selected[storm_id], track_by_id, "static_comparison"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"count": len(requests), "requests": requests}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"count": len(requests), "full_animation": len(FULL_ANIMATION), "static_comparison": len(STATIC_COMPARISON)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
