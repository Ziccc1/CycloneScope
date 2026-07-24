from pathlib import Path
import hashlib
import json
import cdsapi

root = Path.cwd()
out = root / "output" / "processed" / "era5" / "downloads"
out.mkdir(parents=True, exist_ok=True)
target = out / "global-demo-20230218T0000.nc"
request = {
    "product_type": ["reanalysis"],
    "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
    "year": ["2023"], "month": ["02"], "day": ["18"], "time": ["00:00"],
    "area": [90, -180, -90, 180], "grid": [2.0, 2.0],
    "data_format": "netcdf", "download_format": "unarchived"
}
if not target.exists():
    cdsapi.Client(quiet=True, timeout=120, retry_max=2).retrieve("reanalysis-era5-single-levels", request, str(target))
manifest_path = out / "manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["files"] = [x for x in manifest["files"] if x["path"] != str(target)]
manifest["files"].append({"storm_id": None, "name": "GLOBAL_DEMO", "mode": "global_demo", "path": str(target), "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "request": request})
manifest["count"] = len(manifest["files"])
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"file": str(target), "bytes": target.stat().st_size, "manifest_count": manifest["count"]}, ensure_ascii=False))
