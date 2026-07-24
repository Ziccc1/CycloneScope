from pathlib import Path
import argparse
import pandas as pd
import xarray as xr

parser = argparse.ArgumentParser()
parser.add_argument("--input", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
rows = []
ids = {"2009215N20133", "1996203N12152", "2010256N17137", "2015211N13162", "2013306N07162"}
for path in sorted(args.input.glob("*.nc")):
    sid = path.stem.rsplit("-", 2)[0]
    if sid not in ids:
        continue
    with xr.open_dataset(path) as ds:
        subset = ds.sel(latitude=(ds.latitude >= 21.5) & (ds.latitude <= 25.5), longitude=(ds.longitude >= 119.0) & (ds.longitude <= 122.5))
        speed = (subset.u10 ** 2 + subset.v10 ** 2) ** 0.5
        for i, t in enumerate(ds.valid_time.values):
            frame = speed.isel(valid_time=i)
            rows.append({"storm_id": sid, "time": str(t), "max_speed_ms": float(frame.max()), "mean_speed_ms": float(frame.mean()), "gale_cell_count": int((frame >= 17.5).sum())})
out = pd.DataFrame(rows).sort_values(["storm_id", "time"])
args.output.mkdir(parents=True, exist_ok=True)
out.to_parquet(args.output / "taiwan-hazard-time.parquet", index=False)
out.to_json(args.output / "taiwan-hazard-time.json", orient="records", force_ascii=False)
print({"rows": len(out), "storms": sorted(out.storm_id.unique().tolist())})
