from pathlib import Path
import argparse,json,pandas as pd
ap=argparse.ArgumentParser(); ap.add_argument('--input-dir',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); a=ap.parse_args(); rows=[]
for p in sorted(a.input_dir.glob('*.csv')):
 d=pd.read_csv(p,comment='#'); model='tce_2015_fixed_population' if '2015-exposure' in p.name else 'tce_historic_population';
 for _,r in d.iterrows():
  for thr in [34,64,96]: rows.append({'storm_id':str(r.IBTrACS_ID),'event_name':r.TC_name,'year':int(r.year),'genesis_basin':r.genesis_basin,'countries_affected':r.countries_affected,'iso3':r.ISO3,'wind_landfall_kn':r.v_land_kn,'threshold_kn':thr,'exposed_population':float(r[f'{thr}kn_pop']),'exposed_assets':float(r[f'{thr}kn_assets']),'reference_year':2015 if model.startswith('tce_2015') else None,'source':'TCE-DAT DOI 10.5880/pik.2017.005','data_status':'historical_exposure','model_variant':model})
out=pd.DataFrame(rows); a.output.mkdir(parents=True,exist_ok=True); out.to_parquet(a.output/'tce-dat-exposure.parquet',index=False); out.to_json(a.output/'tce-dat-exposure.json',orient='records',force_ascii=False); qa={'schema_version':'1.0','rows':len(out),'events':int(out.storm_id.nunique()),'models':out.model_variant.value_counts().to_dict(),'years':[int(out.year.min()),int(out.year.max())],'source_files':[p.name for p in a.input_dir.glob('*.csv')]}; (a.output/'qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf-8'); print(qa)
