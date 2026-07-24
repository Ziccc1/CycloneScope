import argparse,glob,json
from pathlib import Path
import geopandas as gpd,pandas as pd
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--boundary-root',required=True); ap.add_argument('--population',required=True); ap.add_argument('--out-geojson',required=True); ap.add_argument('--out-admin',required=True); args=ap.parse_args()
 paths=glob.glob(str(Path(args.boundary_root)/'*'/'*.shp')); frames=[]
 for p in paths:
  try: frames.append(gpd.read_file(p).to_crs(4326))
  except Exception: pass
 b=pd.concat(frames,ignore_index=True); b=b.drop_duplicates('CODEBASE'); pop=pd.read_parquet(args.population)
 keep=['stat_zone_id','population_official','male_population','female_population','household_count','reference_date']; p=pop[keep].drop_duplicates('stat_zone_id')
 b=b.merge(p,left_on='CODEBASE',right_on='stat_zone_id',how='left'); b['data_status']=b.population_official.notna().map({True:'official_joined',False:'boundary_without_population'})
 out=Path(args.out_geojson); out.parent.mkdir(parents=True,exist_ok=True); b.to_file(out,driver='GeoJSON')
 agg=b.groupby('COUNTY_ID',dropna=False).agg(population_official=('population_official','sum'),statistical_zone_count=('CODEBASE','nunique'),reference_date=('reference_date','first')).reset_index().rename(columns={'COUNTY_ID':'zone_id'}); agg.to_parquet(args.out_admin,index=False)
 qa={'status':'pass','boundary_features':len(b),'joined_population_rows':int(b.population_official.notna().sum()),'missing_population_rows':int(b.population_official.isna().sum()),'admin_aggregates':len(agg),'official_population_total':float(agg.population_official.sum())}; Path(out.parent/'boundary-population-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(qa,ensure_ascii=False))
if __name__=='__main__': main()
