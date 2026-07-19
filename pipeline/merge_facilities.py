from pathlib import Path
import argparse,geopandas as gpd,pandas as pd
ap=argparse.ArgumentParser(); ap.add_argument('--shelters',type=Path,required=True); ap.add_argument('--medical',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); a=ap.parse_args()
s=gpd.read_file(a.shelters).to_crs(4326); m=gpd.read_file(a.medical).to_crs(4326)
s['facility_id']='shelter-'+s.source_id.astype(str); s['facility_type']='shelter'; s['capacity_value']=pd.to_numeric(s.capacity,errors='coerce'); s['capacity_unit']='people'; s['inventory_scope']='government_list'
m['facility_id']='medical-'+m.facility_id.astype(str); m['facility_type']='medical'; m['capacity_value']=None; m['capacity_unit']=None; m['inventory_scope']='centroid_radius_sample'
cols=['facility_id','facility_type','source_dataset','name','address','longitude','latitude','zone_id','zone_name','capacity_value','capacity_unit','inventory_scope','geometry']
out=pd.concat([s[cols],m[cols]],ignore_index=True); a.output.mkdir(parents=True,exist_ok=True); out.to_file(a.output/'facilities-all.geojson',driver='GeoJSON'); out.drop(columns='geometry').to_parquet(a.output/'facilities-all.parquet',index=False); print({'count':len(out),'types':out.groupby('facility_type').size().to_dict()})
