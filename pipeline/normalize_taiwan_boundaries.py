from pathlib import Path
import argparse
import geopandas as gpd
import json

parser = argparse.ArgumentParser()
parser.add_argument("--input", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
gdf = gpd.read_file(args.input).to_crs(4326)
keep = [c for c in ["shapeName", "shapeISO", "shapeID", "boundaryID", "NAME_1", "GID_1"] if c in gdf.columns]
gdf = gdf[keep + ["geometry"]].copy()
gdf = gdf.rename(columns={"shapeName": "zone_name", "shapeISO": "zone_code", "shapeID": "source_zone_id", "NAME_1": "zone_name", "GID_1": "zone_code"})
gdf["zone_id"] = [f"TWN_ADM1_{i+1:02d}" for i in range(len(gdf))]
args.output.mkdir(parents=True, exist_ok=True)
gdf.to_file(args.output / "zones.geojson", driver="GeoJSON")
gdf.drop(columns="geometry").to_parquet(args.output / "zones-attributes.parquet", index=False)
(args.output / "qa.json").write_text(json.dumps({"count": len(gdf), "crs": "EPSG:4326", "geometry_types": sorted(gdf.geometry.geom_type.unique().tolist()), "empty_geometry_count": int(gdf.geometry.is_empty.sum()), "bounds": [float(x) for x in gdf.total_bounds]}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"count": len(gdf), "bounds": [float(x) for x in gdf.total_bounds]}, ensure_ascii=False))
