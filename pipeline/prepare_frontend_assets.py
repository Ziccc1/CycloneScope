"""Create small, frontend-friendly derivatives without changing authoritative data."""
import argparse,json
from pathlib import Path
import geopandas as gpd

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--zones',required=True); ap.add_argument('--feature-qa',required=True); ap.add_argument('--era5-capability',required=True); ap.add_argument('--out-dir',required=True); ap.add_argument('--admin-zones',required=False); args=ap.parse_args()
 out=Path(args.out_dir); out.mkdir(parents=True,exist_ok=True)
 z=gpd.read_file(args.zones).to_crs(3826)
 if args.admin_zones:
  a=gpd.read_file(args.admin_zones).to_crs(3826); a.geometry=a.geometry.make_valid(); a.to_crs(4326).to_file(out/'taiwan-admin-overview.geojson',driver='GeoJSON')
 z=z[z.geometry.notna() & ~z.geometry.is_empty].copy()
 z.geometry=z.geometry.make_valid()
 z=z[z.geometry.notna() & ~z.geometry.is_empty].copy()
 b=z.bounds
 import numpy as np
 z=z[np.isfinite(b[['minx','miny','maxx','maxy']]).all(axis=1)].copy()
 # 100 m preserves county/island shape for overview maps while reducing payload.
 z.geometry=z.geometry.simplify(100,preserve_topology=True)
 z.to_crs(4326).to_file(out/'statistical-zones-simplified.geojson',driver='GeoJSON')
 qa=json.loads(Path(args.feature_qa).read_text(encoding='utf-8-sig'))
 eligible=[]
 for scope in ('global','wp'):
  q=qa.get(scope,qa)
  bad=set(q.get('bad_storm_ids',[])); eligible.append({'scope':scope,'eligible_for_similarity':True,'excluded_storm_ids':sorted(bad),'excluded_count':len(bad),'point_count':64})
 Path(out/'similarity-eligibility.json').write_text(json.dumps({'schema_version':'1.0','scopes':eligible,'policy':'exclude strict QA failures from Top-K; do not impute insufficient tracks'},ensure_ascii=False,indent=2),encoding='utf-8')
 cap=json.loads(Path(args.era5_capability).read_text(encoding='utf-8-sig'))
 Path(out/'era5-frontend-capability.json').write_text(json.dumps({'schema_version':'1.0','items':cap.get('items',[]),'ui_policy':{'has_dynamic_true':'show_playback','has_static_true_only':'show_static_wind','era5_available_false':'hide_wind_controls'}},ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'simplified_features':len(z),'outputs':[str(out/'statistical-zones-simplified.geojson'),str(out/'similarity-eligibility.json'),str(out/'era5-frontend-capability.json')]},ensure_ascii=False))
if __name__=='__main__': main()

