from pathlib import Path
import argparse, json, time, warnings
import requests, pandas as pd, geopandas as gpd
from shapely.geometry import Point
warnings.filterwarnings("ignore")
parser=argparse.ArgumentParser(); parser.add_argument("--zones",type=Path,required=True); parser.add_argument("--output",type=Path,required=True); parser.add_argument("--radius",type=int,default=40000); args=parser.parse_args()
rows={}
for geom in gpd.read_file(args.zones).to_crs(4326).geometry:
    c=geom.centroid; url=f"https://api.nlsc.gov.tw/other/MarkBufferAnlys/med/{c.x:.6f}/{c.y:.6f}/{args.radius}"
    try: raw=requests.get(url,timeout=60,verify=False).json()
    except Exception: raw=[]
    payload=raw.get("value",[]) if isinstance(raw,dict) else raw
    for item in payload if isinstance(payload,list) else []:
        rows[item.get("id") or f"{item.get('lon')}_{item.get('lat')}"]={"facility_id":item.get("id"),"name":item.get("name"),"short_name":item.get("sname"),"address":item.get("addr"),"telephone":item.get("tel"),"longitude":item.get("lon"),"latitude":item.get("lat"),"facility_type":item.get("marktype")}
    time.sleep(.1)
df=pd.DataFrame(rows.values()).dropna(subset=["longitude","latitude"]); gdf=gpd.GeoDataFrame(df,geometry=[Point(x,y) for x,y in zip(df.longitude,df.latitude)],crs="EPSG:4326"); args.output.mkdir(parents=True,exist_ok=True); gdf.to_file(args.output/"medical.geojson",driver="GeoJSON"); gdf.drop(columns="geometry").to_parquet(args.output/"medical.parquet",index=False); qa={"count":len(gdf),"duplicate_id_count":int(gdf.facility_id.duplicated().sum()),"bounds":[float(x) for x in gdf.total_bounds],"crs":"EPSG:4326","query_radius_m":args.radius}; (args.output/"qa.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding="utf-8"); print(json.dumps(qa,ensure_ascii=False))
