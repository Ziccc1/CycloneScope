from pathlib import Path
import argparse,pandas as pd,geopandas as gpd,rasterio
from rasterio.mask import mask
ap=argparse.ArgumentParser(); ap.add_argument('--zones',type=Path,required=True); ap.add_argument('--population',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); a=ap.parse_args(); z=gpd.read_file(a.zones).to_crs(4326)
rows=[]
with rasterio.open(a.population) as src:
 for _,r in z.iterrows():
  try:
   arr,_=mask(src,[r.geometry],crop=True,filled=False); val=float(arr[0].sum())
  except Exception: val=0.0
  rows.append({'zone_id':r.zone_id,'zone_code':r.zone_code,'zone_name':r.zone_name,'population_worldpop':val,'population_official':None,'population_reference_year':2025,'source_dataset':'WorldPop Global2 R2025A 2025','data_status':'modeled_worldpop_aggregate'})
out=pd.DataFrame(rows); a.output.mkdir(parents=True,exist_ok=True); out.to_parquet(a.output/'zones-population-2025.parquet',index=False); out.to_json(a.output/'zones-population-2025.json',orient='records',force_ascii=False); print({'zones':len(out),'population_sum':float(out.population_worldpop.sum())})
