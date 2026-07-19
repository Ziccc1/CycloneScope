from pathlib import Path
import json
import cdsapi

out = Path(__file__).resolve().parents[1] / "output" / "processed" / "era5" / "smoke"
out.mkdir(parents=True, exist_ok=True)
target = out / "era5-smoke-20131108.nc"

client = cdsapi.Client(quiet=True, timeout=60, retry_max=1)
request = {
    "product_type": ["reanalysis"],
    "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
    "year": ["2013"],
    "month": ["11"],
    "day": ["08"],
    "time": ["00:00"],
    "area": [30, 120, 20, 130],
    "data_format": "netcdf",
    "download_format": "unarchived",
}
print("submitting", target)
client.retrieve("reanalysis-era5-single-levels", request, str(target))
print(json.dumps({"path": str(target), "bytes": target.stat().st_size}, ensure_ascii=False))
