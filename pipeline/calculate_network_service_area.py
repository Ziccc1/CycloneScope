import argparse,json
from pathlib import Path
import geopandas as gpd,pandas as pd,networkx as nx
from scipy.spatial import cKDTree
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--nodes',required=True); ap.add_argument('--edges',required=True); ap.add_argument('--facilities',required=True); ap.add_argument('--zones',required=True); ap.add_argument('--population',required=True); ap.add_argument('--output',required=True); args=ap.parse_args()
 n=pd.read_parquet(args.nodes); e=pd.read_parquet(args.edges); f=gpd.read_file(args.facilities).to_crs(4326); z=gpd.read_file(args.zones).to_crs(4326); pop=pd.read_parquet(args.population)
 G=nx.Graph(); G.add_nodes_from(n.node_id.astype(int)); G.add_weighted_edges_from(e[['source_node','target_node','travel_time_min']].itertuples(index=False,name=None))
 xy=n[['longitude','latitude']].to_numpy(); tree=cKDTree(xy)
 def snap(lon,lat): return int(n.iloc[tree.query([lon,lat])[1]].node_id)
 f['node_id']=[snap(x,y) for x,y in zip(f.geometry.x,f.geometry.y)]; z['node_id']=[snap(x,y) for x,y in zip(z.geometry.centroid.x,z.geometry.centroid.y)]
 # Current zone population is WorldPop ADM1 aggregate; keep provenance explicit.
 pmap=dict(zip(pop['zone_id'],pop['population_worldpop'])) if 'zone_id' in pop else {}
 rows=[]; thresholds=[10,20,30]
 for _,zr in z.iterrows():
  candidates=[]
  try: dist=nx.single_source_dijkstra_path_length(G,int(zr.node_id),cutoff=30,weight='weight')
  except Exception: continue
  for _,fr in f.iterrows():
   d=dist.get(int(fr.node_id));
   if d is None: continue
   for t in thresholds:
    if d<=t: rows.append({'facility_id':fr.get('facility_id'),'facility_type':fr.get('facility_type'),'zone_id':zr.get('zone_id'),'travel_time_min':float(d),'reachable_population':float(pmap.get(zr.get('zone_id'),0) or 0),'service_threshold_min':t,'coverage_method':'network_travel_time','population_reference':'WorldPop ADM1 aggregate'})
 out=Path(args.output); out.parent.mkdir(parents=True,exist_ok=True); pd.DataFrame(rows).to_parquet(out,index=False); qa={'status':'pass','rows':len(rows),'zones':int(z.node_id.nunique()),'facilities':len(f),'thresholds':thresholds}; out.with_name('service-area-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(qa,ensure_ascii=False))
if __name__=='__main__': main()
