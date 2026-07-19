from pathlib import Path
import argparse
import json
import numpy as np
import pandas as pd
import rasterio
from scipy.spatial import cKDTree

parser = argparse.ArgumentParser()
parser.add_argument("--population", type=Path, required=True)
parser.add_argument("--hazard", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
hazard = pd.read_parquet(args.hazard)
with rasterio.open(args.population) as src:
    pop = src.read(1, masked=True)
    valid = ~pop.mask if hasattr(pop, "mask") else np.ones(pop.shape, dtype=bool)
    pop_values = pop.filled(0).astype(np.float64)
    rows, cols = np.indices(pop.shape)
    xs, ys = rasterio.transform.xy(src.transform, rows, cols, offset="center")
    coords = np.column_stack([np.asarray(xs).ravel(), np.asarray(ys).ravel()])
results = []
thresholds = {"gale_34kt": 17.5, "storm_48kt": 24.7, "typhoon_64kt": 32.9}
for storm_id, group in hazard.groupby("storm_id"):
    tree = cKDTree(group[["longitude", "latitude"]].to_numpy())
    _, nearest = tree.query(coords)
    case_speed = group.iloc[nearest]["max_speed_ms"].to_numpy().reshape(pop_values.shape)
    for label, threshold in thresholds.items():
        exposed = valid & (case_speed >= threshold)
        results.append({"storm_id": storm_id, "hazard_class": label, "threshold_ms": threshold, "exposed_population_estimate": float(pop_values[exposed].sum()), "exposed_cell_count": int(exposed.sum())})
args.output.mkdir(parents=True, exist_ok=True)
(args.output / "taiwan-exposure-summary.json").write_text(json.dumps({"schema_version": "1.0", "semantics": "modeled population exposure, not reported disaster loss", "method": "nearest 0.5-degree ERA5 max-wind cell assigned to valid WorldPop 100m cells", "results": results}, ensure_ascii=False, indent=2), encoding="utf-8")
pd.DataFrame(results).to_parquet(args.output / "taiwan-exposure-summary.parquet", index=False)
print(json.dumps({"rows": len(results)}, ensure_ascii=False))
