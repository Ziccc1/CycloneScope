from pathlib import Path
import json
import xarray as xr

ROOT = Path(r"C:\Users\24222\Desktop\数据可~1\CYCLON~1")
indir = ROOT / "output" / "processed" / "era5" / "downloads"
qa_dir = ROOT / "output" / "processed" / "era5" / "qa"
qa_dir.mkdir(parents=True, exist_ok=True)
rows, frames = [], []
for path in sorted(indir.glob("*.nc")):
    with xr.open_dataset(str(path)) as ds:
        lat, lon = "latitude", "longitude"
        times = [str(x) for x in ds.time.values]
        speed = (ds.u10 ** 2 + ds.v10 ** 2) ** 0.5
        rows.append({"file": path.name, "bytes": path.stat().st_size, "valid": {"u10", "v10"}.issubset(ds.data_vars), "dims": {k: int(v) for k, v in ds.sizes.items()}, "variables": list(ds.data_vars), "time_count": len(times), "speed_ms_min": float(speed.min()), "speed_ms_max": float(speed.max()), "latitude_range": [float(ds[lat].min()), float(ds[lat].max())], "longitude_range": [float(ds[lon].min()), float(ds[lon].max())]})
        sid = path.stem.rsplit("-", 2)[0]
        for i, t in enumerate(times):
            frames.append({"frame_id": f"{path.stem}-{i:04d}", "storm_id": sid, "time": t, "time_index": i, "netcdf": f"output/processed/era5/downloads/{path.name}"})
(qa_dir / "era5-file-qa.json").write_text(json.dumps({"count": len(rows), "valid_count": sum(x["valid"] for x in rows), "files": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
(qa_dir / "era5-frame-manifest.json").write_text(json.dumps({"count": len(frames), "frames": frames}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"files": len(rows), "valid": sum(x["valid"] for x in rows), "frames": len(frames)}, ensure_ascii=False))
