from pathlib import Path
import argparse, json
import geopandas as gpd

parser=argparse.ArgumentParser(); parser.add_argument("--zones",type=Path,required=True); parser.add_argument("--shelters",type=Path,required=True); parser.add_argument("--medical",type=Path,required=True); parser.add_argument("--output",type=Path,required=True); args=parser.parse_args()
zones=gpd.read_file(args.zones).to_crs(4326)[["zone_id","zone_name","zone_code","geometry"]]
s=gpd.read_file(args.shelters).to_crs(4326)
s=s.rename(columns={"\u9810\u8a08\u6536\u5bb9\u6751\u91cc":"expected_villages","\u7ba1\u7406\u4eba\u59d3\u540d":"manager_name","\u7ba1\u7406\u4eba\u96fb\u8a71":"manager_phone"})
s["facility_type"]="shelter"; s["source_dataset"]="taiwan_shelters_73242"; s=s[["source_id","facility_type","source_dataset","name","address","admin_name","village","expected_villages","manager_name","manager_phone","capacity","hazard_types","indoor","outdoor","vulnerable_suitable","longitude","latitude","geometry"]]
s=gpd.sjoin(s,zones[["zone_id","zone_name","geometry"]],how="left",predicate="within").drop(columns=["index_right"])
m=gpd.read_file(args.medical).to_crs(4326).rename(columns={"facility_type":"medical_facility_type"})
m["facility_type"]="medical"; m["source_dataset"]="nlsc_medical_api_139250"; m=m[["facility_id","facility_type","source_dataset","name","short_name","address","telephone","medical_facility_type","longitude","latitude","geometry"]]
m=gpd.sjoin(m,zones[["zone_id","zone_name","geometry"]],how="left",predicate="within").drop(columns=["index_right"])
args.output.mkdir(parents=True,exist_ok=True); s.to_file(args.output/"shelters.geojson",driver="GeoJSON"); s.drop(columns="geometry").to_parquet(args.output/"shelters.parquet",index=False); m.to_file(args.output/"medical.geojson",driver="GeoJSON"); m.drop(columns="geometry").to_parquet(args.output/"medical.parquet",index=False)
qa={"shelter_count":len(s),"shelter_zone_match_rate":float(s.zone_id.notna().mean()),"medical_count":len(m),"medical_zone_match_rate":float(m.zone_id.notna().mean()),"crs":"EPSG:4326"}; (args.output/"qa-interface.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding="utf-8"); print(json.dumps(qa,ensure_ascii=False))
