from pathlib import Path
import json
import xarray as xr

p = Path(__file__).resolve().parents[1] / "output" / "processed" / "era5" / "smoke" / "era5-smoke-20131108.nc"
with xr.open_dataset(p) as ds:
    result = {
        "path": str(p),
        "bytes": p.stat().st_size,
        "dims": {k: int(v) for k, v in ds.sizes.items()},
        "vars": list(ds.data_vars),
        "coords": list(ds.coords),
        "units": {k: ds[k].attrs.get("units") for k in ds.data_vars},
        "latitude_range": [float(ds.latitude.min()), float(ds.latitude.max())],
        "longitude_range": [float(ds.longitude.min()), float(ds.longitude.max())],
    }
print(json.dumps(result, ensure_ascii=False))
