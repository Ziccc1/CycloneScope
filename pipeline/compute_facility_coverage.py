from pathlib import Path
import argparse, json
import numpy as np, pandas as pd, rasterio
from scipy.spatial import cKDTree

parser=argparse.ArgumentParser(); parser.add_argument("--population",type=Path,required=True); parser.add_argument("--facilities",type=Path,required=True); parser.add_argument("--output",type=Path,required=True); args=parser.parse_args()
fac=pd.read_parquet(args.facilities).dropna(subset=["longitude","latitude"])
ftree=cKDTree(fac[["longitude","latitude"]].to_numpy())
with rasterio.open(args.population) as src:
    pop=src.read(1,masked=True); valid=~pop.mask if hasattr(pop,"mask") else np.ones(pop.shape,bool); vals=pop.filled(0).astype(float); rows,cols=np.where(valid); xs,ys=rasterio.transform.xy(src.transform,rows,cols,offset="center"); coords=np.column_stack([np.asarray(xs),np.asarray(ys)])
    dist_deg,_=ftree.query(coords)
    # conservative degree-to-km conversion at Taiwan latitude
    dist_km=dist_deg*100.0
results=[]
for radius in [5,10,20]:
    covered=dist_km<=radius; results.append({"radius_km":radius,"covered_population_estimate":float(vals[rows,cols][covered].sum()),"covered_cell_count":int(covered.sum()),"coverage_ratio":float(vals[rows,cols][covered].sum()/vals[rows,cols].sum()),"facility_count":int((ftree.query_ball_point(coords, radius/100.0, return_length=True)>0).sum())})
args.output.mkdir(parents=True,exist_ok=True); (args.output/"shelter-coverage-2025.json").write_text(json.dumps({"population_reference":"WorldPop R2025A 2025","method":"nearest facility on lon/lat KDTree; approximate km conversion","results":results},ensure_ascii=False,indent=2),encoding="utf-8"); print(json.dumps(results,ensure_ascii=False))
