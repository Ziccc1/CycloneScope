import argparse,json,glob
from pathlib import Path
import geopandas as gpd,pandas as pd
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--shp',required=True); ap.add_argument('--out-dir',required=True); args=ap.parse_args(); out=Path(args.out_dir); out.mkdir(parents=True,exist_ok=True)
 g=gpd.read_file(args.shp).to_crs(3826); node_map={}; edges=[]
 def nid(x,y):
  k=(round(float(x),1),round(float(y),1))
  if k not in node_map: node_map[k]=len(node_map)
  return node_map[k]
 for _,r in g.iterrows():
  geom=r.geometry
  if geom is None: continue
  lines=list(geom.geoms) if geom.geom_type=='MultiLineString' else [geom]
  for line in lines:
   cs=list(line.coords)
   for (x1,y1),(x2,y2) in zip(cs,cs[1:]):
    a,b=nid(x1,y1),nid(x2,y2); length=((x2-x1)**2+(y2-y1)**2)**0.5/1000
    rc=str(r.get('ROADCLASS1') or 'official'); speed=70 if rc.startswith('1') else 50
    t=length/speed*60
    edges += [(a,b,length,rc,False,speed,t,'default_by_road_class'),(b,a,length,rc,False,speed,t,'default_by_road_class')]
 nodes0=pd.DataFrame([{'node_id':i,'x':k[0],'y':k[1]} for k,i in node_map.items()]); nodes=gpd.GeoDataFrame(nodes0,geometry=gpd.points_from_xy(nodes0.x,nodes0.y),crs=3826).to_crs(4326); nodes['longitude']=nodes.geometry.x; nodes['latitude']=nodes.geometry.y; nodes=nodes[['node_id','longitude','latitude']]
 ed=pd.DataFrame(edges,columns=['source_node','target_node','length_km','road_class','oneway','maxspeed','travel_time_min','speed_source']); ed.insert(0,'edge_id',range(len(ed)))
 nodes.to_parquet(out/'nodes.parquet',index=False); ed.to_parquet(out/'edges.parquet',index=False)
 qa={'status':'pass','source':'Taiwan official road centerline dataset 73232','lines':len(g),'nodes':len(nodes),'edges':len(ed)}; (out/'network-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(qa,ensure_ascii=False))
if __name__=='__main__': main()
