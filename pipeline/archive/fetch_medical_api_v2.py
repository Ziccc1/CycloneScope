from pathlib import Path
import argparse
import json
import time
import requests
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point

parser = argparse.ArgumentParser()
parser.add_argument("--zones", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--radius", type=int, default=40000)
args = parser.parse_args()
zones = gpd.read_file(args.zones).to_crs(4326)
rows = {}
for geom in zones.geometry:
    c = geom.centroid
    url = f"https://api.nlsc.gov.tw/other/MarkBufferAnlys/med/{c.x:.6f}/{c.y:.6f}/{args.radius}"
    response = requests.get(url, timeout=60, verify=False)
    payload = response.json().get("value", [])
    for item in payload:
        rows[item.get("id")] = {"facility_id": item.get("id"), "name": item.get("name"), "short_name": item.get("sname"), "address": item.get("addr"), "telephone": item.get("tel"), "longitude": item.get("lon"), "latitude": item.get("lat"), "facility_type": item.get("marktype")}
    time.sleep(0.1)
df = pd.DataFrame(rows.values()).dropna(subset=["longitude", "latitude"])
gdf = gpd.GeoDataFrame(df, geometry=[Point(x, y) for x, y in zip(df.longitude, df.latitude)], crs="EPSG:4326")
args.output.mkdir(parents=True, exist_ok=True)
gdf.to_file(args.output / "medical.geojson", driver="GeoJSON")
gdf.drop(columns="geometry").to_parquet(args.output / "medical.parquet", index=False)
qa = {"count": len(gdf), "duplicate_id_count": int(gdf.facility_id.duplicated().sum()), "bounds": [float(x) for x in gdf.total_bounds], "crs": "EPSG:4326", "query_radius_m": args.radius, "tls_verification": "disabled due source certificate chain"}
(args.output / "qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(qa, ensure_ascii=False))
