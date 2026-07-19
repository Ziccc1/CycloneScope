from pathlib import Path
import json
import math
import xarray as xr

root = Path.cwd()
indir = root / "output" / "processed" / "era5" / "downloads"
qa_dir = root / "output" / "processed" / "era5" / "qa"
qa_dir.mkdir(parents=True, exist_ok=True)
rows = []
frames = []
for path in sorted(indir.glob("*.nc")):
    with xr.open_dataset(path) as ds:
        required = {"u10", "v10"}
        missing = sorted(required - set(ds.data_vars))
        time_name = "time" if "time" in ds.coords else next((x for x in ds.coords if "time" in x.lower()), None)
        lat_name = "latitude" if "latitude" in ds.coords else "lat"
        lon_name = "longitude" if "longitude" in ds.coords else "lon"
        valid = not missing and time_name is not None and lat_name in ds.coords and lon_name in ds.coords
        u = ds["u10"] if "u10" in ds else None
        v = ds["v10"] if "v10" in ds else None
        if valid:
            speed = (u * u + v * v) ** 0.5
            speed_min = float(speed.min())
            speed_max = float(speed.max())
            ntime = int(ds.sizes[time_name])
            times = [str(x) for x in ds[time_name].values]
            for idx, timestamp in enumerate(times):
                frames.append({"frame_id": f"{path.stem}-{idx:04d}", "storm_file": path.name, "storm_id": path.stem.rsplit("-", 2)[0], "time": timestamp, "time_index": idx, "netcdf": str(path.relative_to(root)).replace("\\", "/")})
        else:
            speed_min = speed_max = math.nan
            ntime = 0
        rows.append({"file": path.name, "bytes": path.stat().st_size, "valid": valid, "missing": missing, "dims": {k: int(v) for k, v in ds.sizes.items()}, "variables": list(ds.data_vars), "time_count": ntime, "speed_ms_min": speed_min, "speed_ms_max": speed_max, "latitude_range": [float(ds[lat_name].min()), float(ds[lat_name].max())] if lat_name in ds.coords else None, "longitude_range": [float(ds[lon_name].min()), float(ds[lon_name].max())] if lon_name in ds.coords else None})

(qa_dir / "era5-file-qa.json").write_text(json.dumps({"count": len(rows), "valid_count": sum(x["valid"] for x in rows), "files": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
(qa_dir / "era5-frame-manifest.json").write_text(json.dumps({"count": len(frames), "frames": frames}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"files": len(rows), "valid": sum(x["valid"] for x in rows), "frames": len(frames)}, ensure_ascii=False))
