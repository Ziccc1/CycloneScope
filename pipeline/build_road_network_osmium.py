import argparse, json, math
from pathlib import Path
import osmium, pandas as pd

SPEED={'motorway':90,'trunk':70,'primary':50,'secondary':40,'tertiary':35,'residential':30,'unclassified':30,'service':20}
class H(osmium.SimpleHandler):
    def __init__(self): super().__init__(); self.nodes={}; self.edges=[]; self.ways=0
    def way(self,w):
        hw=w.tags.get('highway')
        if hw not in SPEED or len(w.nodes)<2: return
        self.ways+=1; refs=[]
        for n in w.nodes:
            if n.location.valid(): self.nodes[int(n.ref)]=(float(n.lon),float(n.lat)); refs.append(int(n.ref))
        if len(refs)<2:return
        oneway=str(w.tags.get('oneway','')).lower() in ('yes','1','true')
        maxspeed=w.tags.get('maxspeed'); sp=None
        try: sp=float(str(maxspeed).split()[0])
        except: sp=None
        if not sp: sp=SPEED[hw]; source='default_by_road_class'
        else: source='osm'
        for a,b in zip(refs,refs[1:]):
            lon1,lat1=self.nodes[a]; lon2,lat2=self.nodes[b]
            dx=(lon2-lon1)*111.32*math.cos(math.radians((lat1+lat2)/2)); dy=(lat2-lat1)*111.32
            length=math.hypot(dx,dy); self.edges.append((a,b,length,hw,oneway,sp,length/sp*60,source))
            if not oneway: self.edges.append((b,a,length,hw,oneway,sp,length/sp*60,source))

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--pbf',required=True); ap.add_argument('--out-dir',required=True); args=ap.parse_args(); out=Path(args.out_dir); out.mkdir(parents=True,exist_ok=True)
 h=H(); h.apply_file(args.pbf,locations=True)
 nodes=pd.DataFrame([{'node_id':k,'longitude':v[0],'latitude':v[1]} for k,v in h.nodes.items()]); edges=pd.DataFrame([{'edge_id':i,'source_node':a,'target_node':b,'length_km':l,'road_class':c,'oneway':o,'maxspeed':s,'travel_time_min':t,'speed_source':q} for i,(a,b,l,c,o,s,t,q) in enumerate(h.edges)])
 nodes.to_parquet(out/'nodes.parquet',index=False); edges.to_parquet(out/'edges.parquet',index=False)
 qa={'status':'pass','ways':h.ways,'nodes':len(nodes),'edges':len(edges),'road_classes':edges.road_class.value_counts().to_dict() if len(edges) else {}}
 (out/'network-qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(qa,ensure_ascii=False))
if __name__=='__main__': main()
