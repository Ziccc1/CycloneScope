from pathlib import Path
import argparse,json
import numpy as np,pandas as pd,rasterio
from scipy.spatial import cKDTree
ap=argparse.ArgumentParser(); ap.add_argument('--population',type=Path,required=True); ap.add_argument('--hazard',type=Path,required=True); ap.add_argument('--classic',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); a=ap.parse_args()
h=pd.read_parquet(a.hazard); classic=json.loads(a.classic.read_text(encoding='utf-8'))['items']; thresholds={'gale_34kt':17.5,'storm_48kt':24.7,'typhoon_64kt':32.9}
with rasterio.open(a.population) as src:
 pop=src.read(1,masked=True); valid=~pop.mask if hasattr(pop,'mask') else np.ones(pop.shape,bool); vals=pop.filled(0).astype(float); rows,cols=np.indices(pop.shape); xs,ys=rasterio.transform.xy(src.transform,rows,cols,offset='center'); coords=np.c_[np.asarray(xs).ravel(),np.asarray(ys).ravel()]
res=[]
for item in classic:
 sid=str(item['id']); g=h[h.storm_id==sid];
 if len(g):
  tree=cKDTree(g[['longitude','latitude']].to_numpy()); _,ix=tree.query(coords); speed=g.iloc[ix].max_speed_ms.to_numpy().reshape(vals.shape)
 for label,thr in thresholds.items():
  if len(g):
   mask=valid&(speed>=thr); pop_est=float(vals[mask].sum()); cells=int(mask.sum()); status='modeled_exposure'
  else: pop_est=None; cells=None; status='no_hazard_grid_for_taiwan'
  res.append({'storm_id':sid,'storm_name':item.get('name'),'basin':item.get('basin'),'hazard_class':label,'threshold_ms':thr,'exposed_population_estimate':pop_est,'exposed_cell_count':cells,'population_reference_year':2025,'coverage_method':'nearest 0.5-degree ERA5 max-wind cell to WorldPop 100m','data_status':status})
a.output.mkdir(parents=True,exist_ok=True); pd.DataFrame(res).to_parquet(a.output/'classic-16-exposure.parquet',index=False); (a.output/'classic-16-exposure.json').write_text(json.dumps({'schema_version':'1.0','semantics':'modeled population exposure, not reported disaster loss','results':res},ensure_ascii=False,indent=2),encoding='utf-8'); print({'rows':len(res),'modeled':sum(x['data_status']=='modeled_exposure' for x in res),'missing':sum(x['data_status']!='modeled_exposure' for x in res)})
