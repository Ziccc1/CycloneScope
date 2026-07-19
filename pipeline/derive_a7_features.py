from pathlib import Path
import argparse,json
import numpy as np
import pandas as pd

ap=argparse.ArgumentParser(); ap.add_argument('--tracks',type=Path,required=True); ap.add_argument('--classic',type=Path); ap.add_argument('--output',type=Path,required=True); args=ap.parse_args()
N=64
df=pd.read_parquet(args.tracks)
df['time']=pd.to_datetime(df['time'],utc=True,errors='coerce')
df=df.dropna(subset=['storm_id','time','lon','lat']).copy(); df=df.sort_values(['storm_id','time'])

def interp(a):
    a=np.asarray(a,dtype=float); x=np.linspace(0,1,len(a)); good=np.isfinite(a)
    if good.sum()==0: return np.full(N,np.nan)
    if good.sum()==1: return np.full(N,a[good][0])
    return np.interp(np.linspace(0,1,N),x[good],a[good])
def hav(lon1,lat1,lon2,lat2):
    r=6371.; p=np.pi/180; dlat=(lat2-lat1)*p; dlon=(lon2-lon1)*p
    a=np.sin(dlat/2)**2+np.cos(lat1*p)*np.cos(lat2*p)*np.sin(dlon/2)**2
    return 2*r*np.arcsin(np.sqrt(np.clip(a,0,1)))
def bearing(lon1,lat1,lon2,lat2):
    p=np.pi/180; x=np.sin((lon2-lon1)*p)*np.cos(lat2*p); y=np.cos(lat1*p)*np.sin(lat2*p)-np.sin(lat1*p)*np.cos(lat2*p)*np.cos((lon2-lon1)*p)
    return (np.degrees(np.arctan2(x,y))+360)%360
features=[]; scalar=[]; bad=[]
for sid,g in df.groupby('storm_id',sort=False):
    g=g.drop_duplicates('time').sort_values('time'); lon=np.unwrap(np.radians(g.lon.to_numpy(float)))*180/np.pi; lat=g.lat.to_numpy(float)
    if len(g)<2 or not np.isfinite(lon).all() or not np.isfinite(lat).all(): bad.append(str(sid)); continue
    t=np.linspace(0,1,N); xx=np.interp(t,np.linspace(0,1,len(g)),lon); yy=np.interp(t,np.linspace(0,1,len(g)),lat)
    x=xx-xx[0]; y=yy-yy[0]; scale=float(np.nanmax(np.hypot(x,y))) or 1.0;
    # Procrustes-style rotation: align overall start-to-end direction with +x.
    nz=np.where(np.hypot(x,y)>1e-9)[0]; theta=float(np.arctan2(y[nz[-1]],x[nz[-1]])) if len(nz) else 0.0; cs,ss=np.cos(theta),np.sin(theta); xr=x*cs+y*ss; yr=-x*ss+y*cs; xn=xr/scale; yn=yr/scale
    wind=interp(g.wind_ms); pres=interp(g.pressure_hpa); speed=interp(g.moving_speed_kmh)
    bear=np.concatenate([[np.nan],bearing(xx[:-1],yy[:-1],xx[1:],yy[1:])])
    path=float(np.nansum(hav(xx[:-1],yy[:-1],xx[1:],yy[1:])))
    duration=float((g.time.iloc[-1]-g.time.iloc[0]).total_seconds()/3600)
    features.append({'storm_id':str(sid),'point_count_original':int(len(g)),'start_time':g.time.iloc[0].isoformat().replace('+00:00','Z'),'end_time':g.time.iloc[-1].isoformat().replace('+00:00','Z'),'points':np.round(np.c_[xx,yy],6).tolist(),'shape_normalized':np.round(np.c_[xn,yn],6).tolist(),'wind_ms':np.round(wind,4).tolist(),'pressure_hpa':np.round(pres,3).tolist(),'moving_speed_kmh':np.round(speed,4).tolist(),'bearing_deg':np.round(bear,3).tolist(),'t_fraction':np.round(t,6).tolist()})
    scalar.append({'storm_id':str(sid),'point_count_original':int(len(g)),'duration_hours':duration,'path_length_km':path,'max_wind_ms':float(np.nanmax(g.wind_ms)) if np.isfinite(g.wind_ms).any() else None,'min_pressure_hpa':float(np.nanmin(g.pressure_hpa)) if np.isfinite(g.pressure_hpa).any() else None,'max_speed_kmh':float(np.nanmax(g.moving_speed_kmh)) if np.isfinite(g.moving_speed_kmh).any() else None})
args.output.mkdir(parents=True,exist_ok=True)
(args.output/'features-64.json').write_text(json.dumps(features,ensure_ascii=False),encoding='utf-8')
pd.DataFrame(scalar).to_parquet(args.output/'feature-scalars.parquet',index=False)
mat=np.asarray([np.asarray(f['shape_normalized']).reshape(-1) for f in features],dtype='float32')
np.save(args.output/'shape-normalized.npy',mat)
ids=[f['storm_id'] for f in features]
(args.output/'feature-matrix.json').write_text(json.dumps({'schema_version':'1.0','point_count':N,'feature':'shape_normalized','storm_ids':ids,'matrix_shape':list(mat.shape),'values_file':'shape-normalized.npy'},ensure_ascii=False,indent=2),encoding='utf-8')
classic_ids=[]
if args.classic and args.classic.exists(): classic_ids=[str(x['id']) for x in json.loads(args.classic.read_text(encoding='utf-8'))['items']]
classic_set=set(classic_ids); present=[f for f in features if f['storm_id'] in classic_set]
(args.output/'classic-features-64.json').write_text(json.dumps(present,ensure_ascii=False),encoding='utf-8')
qa={'schema_version':'1.0','source_tracks':str(args.tracks),'storm_count_input':int(df.storm_id.nunique()),'storm_count_output':len(features),'classic_requested':len(classic_ids),'classic_present':len(present),'classic_missing':[x for x in classic_ids if x not in {f['storm_id'] for f in features}],'point_count':N,'bad_storm_count':len(bad),'bad_storm_ids':bad[:50],'all_feature_lengths_64':all(len(f['points'])==N and len(f['shape_normalized'])==N for f in features),'finite_shape_values':bool(np.isfinite(mat).all()),'duplicate_storm_ids':len(ids)-len(set(ids)),'crs':'EPSG:4326'}
(args.output/'qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(qa,ensure_ascii=False))
