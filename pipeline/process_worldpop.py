from pathlib import Path
import argparse
import json
import rasterio
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--input", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
with rasterio.open(args.input) as src:
    data = src.read(1, masked=True)
    values = data.compressed().astype(float)
    summary = {
        "schema_version": "1.0",
        "dataset": "WorldPop Taiwan 100m Population",
        "year": 2015,
        "variant": "adjusted",
        "crs": src.crs.to_string() if src.crs else None,
        "width": src.width,
        "height": src.height,
        "resolution_degrees": [src.transform.a, abs(src.transform.e)],
        "bounds": [src.bounds.left, src.bounds.bottom, src.bounds.right, src.bounds.top],
        "nodata": src.nodata,
        "cell_count_valid": int(values.size),
        "population_sum_estimated": float(values.sum()),
        "population_min": float(values.min()) if values.size else None,
        "population_max": float(values.max()) if values.size else None,
        "negative_cell_count": int((values < 0).sum()),
        "source_file": str(args.input),
    }
(args.output / "population-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
(args.output / "field-contract.json").write_text(json.dumps({"population_estimate": "persons per 100m grid cell", "semantics": "estimated_exposure_not_reported_damage", "crs": summary["crs"], "selected_variant": "popmap15adj"}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False))
