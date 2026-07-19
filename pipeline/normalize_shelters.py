from pathlib import Path
import argparse
import json
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point

parser = argparse.ArgumentParser()
parser.add_argument("--input", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
df = pd.read_csv(args.input, encoding="utf-8-sig")
rename = {"序號":"source_id", "縣市及鄉鎮市區":"admin_name", "村里":"village", "避難收容處所地址":"address", "經度":"longitude", "緯度":"latitude", "避難收容處所名稱":"name", "預計收容人數":"capacity", "適用災害類別":"hazard_types", "室內":"indoor", "室外":"outdoor", "適合避難弱者安置":"vulnerable_suitable"}
df = df.rename(columns=rename)
for col in ["longitude", "latitude", "capacity"]: df[col] = pd.to_numeric(df[col], errors="coerce")
df = df.dropna(subset=["longitude", "latitude"]).copy()
df = df[df.longitude.between(116, 123) & df.latitude.between(20, 27)]
df = df.drop_duplicates(subset=["name", "longitude", "latitude"])
gdf = gpd.GeoDataFrame(df, geometry=[Point(x, y) for x, y in zip(df.longitude, df.latitude)], crs="EPSG:4326")
args.output.mkdir(parents=True, exist_ok=True)
gdf.to_file(args.output / "shelters.geojson", driver="GeoJSON")
gdf.drop(columns="geometry").to_parquet(args.output / "shelters.parquet", index=False)
qa = {"count": len(gdf), "capacity_sum": float(gdf.capacity.sum()), "missing_capacity": int(gdf.capacity.isna().sum()), "duplicate_after_clean": int(gdf.duplicated(["name", "longitude", "latitude"]).sum()), "bounds": [float(x) for x in gdf.total_bounds], "crs": "EPSG:4326"}
(args.output / "qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(qa, ensure_ascii=False))
