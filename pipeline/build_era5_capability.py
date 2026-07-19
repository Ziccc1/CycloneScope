from pathlib import Path
import argparse,json
ap=argparse.ArgumentParser(); ap.add_argument('--manifest',type=Path,required=True); ap.add_argument('--classic',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); a=ap.parse_args(); m=json.loads(a.manifest.read_text(encoding='utf-8-sig')); items=json.loads(a.classic.read_text(encoding='utf-8'))['items']; by={}
for f in m.get('files',[]):
 sid=f.get('storm_id');
 if sid: by.setdefault(str(sid),[]).append({'mode':f.get('mode'),'path':f.get('path'),'bytes':f.get('bytes'),'request':f.get('request')})
out=[]
for x in items:
 sid=str(x['id']); fs=by.get(sid,[]); out.append({'storm_id':sid,'name':x.get('name'),'era5_available':bool(fs),'era5_file_count':len(fs),'has_dynamic':any(f['mode']=='full_animation' for f in fs),'has_static':any(f['mode']=='static_comparison' for f in fs),'modes':sorted({f['mode'] for f in fs})})
a.output.parent.mkdir(parents=True,exist_ok=True); a.output.write_text(json.dumps({'schema_version':'1.0','items':out,'policy':'front-end checks era5_available and has_dynamic before animation'},ensure_ascii=False,indent=2),encoding='utf-8'); print({'cases':len(out),'dynamic':sum(x['has_dynamic'] for x in out),'available':sum(x['era5_available'] for x in out)})
