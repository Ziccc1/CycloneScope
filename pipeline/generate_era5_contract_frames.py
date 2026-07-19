#!/usr/bin/env python3
"""Convert downloaded ERA5 u10/v10 NetCDF files to frozen WindManifest frames."""

from __future__ import annotations

import gzip
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from netCDF4 import Dataset, num2date


ERA5 = Path("output/processed/era5")
DOWNLOADS = ERA5 / "downloads"
MANIFEST = DOWNLOADS / "manifest.json"
DEST = ERA5 / "wind"


def utc_iso(value) -> str:
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")
    return datetime.fromtimestamp(float(value), tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_frame(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def main() -> None:
    items = json.loads(MANIFEST.read_text(encoding="utf-8-sig"))["files"]
    groups: dict[tuple[str, str], list[dict]] = {}
    for item in items:
        storm = item.get("storm_id") or "global-demo"
        groups.setdefault((str(storm), str(item.get("mode") or "storm")), []).append(item)
    generated = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    for (storm_id, mode), files in groups.items():
        dataset_id = f"{storm_id}-era5"
        target = DEST / ("global" if storm_id == "global-demo" else "storms") / storm_id
        frame_entries = []
        for file_index, item in enumerate(files):
            source = DOWNLOADS / Path(item["path"]).name
            with Dataset(str(source)) as ds:
                lat = np.asarray(ds.variables["latitude"][:], dtype=float)
                lon = np.asarray(ds.variables["longitude"][:], dtype=float)
                u = np.asarray(ds.variables["u10"][:], dtype=float)
                v = np.asarray(ds.variables["v10"][:], dtype=float)
                tv = ds.variables["valid_time"]
                times = num2date(tv[:], units=tv.units, calendar=getattr(tv, "calendar", "standard"), only_use_cftime_datetimes=False)
                # ERA5 latitude is descending and longitude ascending in the source files.
                height, width = int(len(lat)), int(len(lon))
                for idx, timestamp in enumerate(times):
                    frame_name = f"{file_index:02d}-{idx:04d}.json.gz"
                    frame_path = target / "frames" / frame_name
                    uu = np.where(np.isfinite(u[idx]), np.round(u[idx], 3), np.nan).reshape(-1).tolist()
                    vv = np.where(np.isfinite(v[idx]), np.round(v[idx], 3), np.nan).reshape(-1).tolist()
                    # JSON null is the only permitted missing-value representation.
                    uu = [None if isinstance(x, float) and not np.isfinite(x) else x for x in uu]
                    vv = [None if isinstance(x, float) and not np.isfinite(x) else x for x in vv]
                    payload = {
                        "schema_version": "1.0",
                        "dataset_id": dataset_id,
                        "time": utc_iso(timestamp),
                        "width": width,
                        "height": height,
                        "u": uu,
                        "v": vv,
                        "missing_value": None,
                    }
                    write_frame(frame_path, payload)
                    frame_entries.append({
                        "time": payload["time"],
                        "url": str(frame_path.relative_to(ERA5)).replace("\\", "/"),
                        "byte_size": frame_path.stat().st_size,
                        "sha256": hashlib.sha256(frame_path.read_bytes()).hexdigest(),
                    })
        all_lons = []
        all_lats = []
        for item in files:
            source = DOWNLOADS / Path(item["path"]).name
            with Dataset(str(source)) as ds:
                all_lats.extend(np.asarray(ds.variables["latitude"][:], dtype=float).tolist())
                all_lons.extend(np.asarray(ds.variables["longitude"][:], dtype=float).tolist())
        manifest = {
            "schema_version": "1.0",
            "data_status": "reanalysis",
            "source_ids": ["era5"],
            "generated_at": generated,
            "dataset_id": dataset_id,
            "mode": "global" if storm_id == "global-demo" else "storm",
            "storm_id": None if storm_id == "global-demo" else storm_id,
            "units": "m/s",
            "grid_order": "north_to_south_west_to_east_row_major",
            "bounds": {"west": min(all_lons), "south": min(all_lats), "east": max(all_lons), "north": max(all_lats), "crosses_antimeridian": False},
            "resolution_degrees": 2.0 if storm_id == "global-demo" else 0.5,
            "width": int(width),
            "height": int(height),
            "frames": frame_entries,
        }
        target.mkdir(parents=True, exist_ok=True)
        (target / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("generated", len(groups), "wind manifests under", DEST)


if __name__ == "__main__":
    main()
