from pathlib import Path
import argparse, json
import pandas as pd, xarray as xr
ap=argparse.ArgumentParser(); ap.add_argument('--input',type=Path,required=True); ap.add_argument('--classic',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); a=ap.parse_args()
ids={str(x['id']) for x in json.loads(a.classic.read_text(encoding='utf-8'))['items']}; rows=[]
for path in sorted(a.input.glob('*.nc')):
    sid=path.name.split('-')[0]
    if sid not in ids: continue
    try:
      with xr.open_dataset(path) as ds:
        if not {'latitude','longitude','u10','v10'}.issubset(ds.variables): continue
        lat=ds.latitude; lon=ds.longitude
        sub=ds.sel(latitude=lat[(lat>=21.5)&(lat<=25.5)],longitude=lon[(lon>=119)&(lon<=122.5)])
        if sub.latitude.size==0 or sub.longitude.size==0: continue
        speed=(sub.u10**2+sub.v10**2)**0.5; mx=speed.max(dim='valid_time')
        for i,la in enumerate(mx.latitude.values):
          for j,lo in enumerate(mx.longitude.values): rows.append({'storm_id':sid,'latitude':float(la),'longitude':float(lo),'max_speed_ms':float(mx.values[i,j])})
    except Exception as e: print('skip',path.name,str(e))
out=pd.DataFrame(rows)
if len(out): out=out.groupby(['storm_id','latitude','longitude'],as_index=False)['max_speed_ms'].max()
a.output.mkdir(parents=True,exist_ok=True); out.to_parquet(a.output/'taiwan-hazard-max-wind-16.parquet',index=False); out.to_json(a.output/'taiwan-hazard-max-wind-16.json',orient='records',force_ascii=False); print({'rows':len(out),'storms':sorted(out.storm_id.unique().tolist()) if len(out) else []})
