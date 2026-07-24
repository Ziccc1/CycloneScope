from pathlib import Path
import argparse
import pandas as pd
import xarray as xr

parser = argparse.ArgumentParser()
parser.add_argument("--input", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
rows = []
for path in sorted(args.input.glob("*.nc")):
    if path.name.startswith("global-demo"):
        continue
    sid = path.stem.rsplit("-", 2)[0]
    if sid not in {"2009215N20133", "1996203N12152", "2010256N17137", "2015211N13162", "2013306N07162"}:
        continue
    with xr.open_dataset(path) as ds:
        lat_name, lon_name = "latitude", "longitude"
        subset = ds.sel({lat_name: (ds[lat_name] >= 21.5) & (ds[lat_name] <= 25.5), lon_name: (ds[lon_name] >= 119.0) & (ds[lon_name] <= 122.5)})
        speed = (subset.u10 ** 2 + subset.v10 ** 2) ** 0.5
        max_speed = speed.max(dim="valid_time")
        for i, lat in enumerate(max_speed[lat_name].values):
            for j, lon in enumerate(max_speed[lon_name].values):
                rows.append({"storm_id": sid, "latitude": float(lat), "longitude": float(lon), "max_speed_ms": float(max_speed.values[i, j])})
out = pd.DataFrame(rows).groupby(["storm_id", "latitude", "longitude"], as_index=False)["max_speed_ms"].max()
args.output.mkdir(parents=True, exist_ok=True)
out.to_parquet(args.output / "taiwan-hazard-max-wind.parquet", index=False)
out.to_json(args.output / "taiwan-hazard-max-wind.json", orient="records", force_ascii=False)
print({"rows": len(out), "storms": sorted(out.storm_id.unique().tolist()), "max_ms": float(out.max_speed_ms.max()) if len(out) else None})
