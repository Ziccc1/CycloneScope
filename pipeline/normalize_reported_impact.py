from pathlib import Path
import argparse,json,re
import pandas as pd
ap=argparse.ArgumentParser(); ap.add_argument('--input',type=Path,required=True); ap.add_argument('--classic',type=Path); ap.add_argument('--output',type=Path,required=True); a=ap.parse_args()
if a.input.suffix.lower() in ['.xlsx','.xls']: d=pd.read_excel(a.input)
else: d=pd.read_csv(a.input)
d=d[d['Disaster Type'].astype(str).str.lower().eq('storm')].copy()
# CycloneScope needs tropical cyclone events; keep the broader storm table available in raw Excel.
d=d[d['Disaster Subtype'].astype(str).str.lower().eq('tropical cyclone')].copy()
classic=[]
if a.classic and a.classic.exists(): classic=json.loads(a.classic.read_text(encoding='utf-8'))['items']
def norm(x): return re.sub(r'[^A-Z0-9]','',str(x).upper())
def clean_name(x):
 s=str(x).upper(); s=re.sub(r"['\"()\[\],.-]",' ',s); s=re.sub(r'\b(TYPHOON|HURRICANE|TROPICAL|CYCLONE|STORM|SUPER|TAIFUN|TYPHOON)\b',' ',s); return norm(s)
cat={(int(x['season']),norm(x.get('name',''))):str(x['id']) for x in classic}; catlist=[(int(x['season']),norm(x.get('name','')),str(x['id'])) for x in classic]
def match(row):
 y=int(row['Start Year']) if pd.notna(row['Start Year']) else None; ev=clean_name(row['Event Name']); cand=[]
 for season,name,sid in catlist:
  if y==season and name and (name in ev or ev in name): cand.append(sid)
 return (cand[0],1.0) if len(cand)==1 else ((cand[0],0.7) if cand else (None,0.0))
matched=d.apply(match,axis=1,result_type='expand'); matched.columns=['storm_id','match_confidence']; d['storm_id']=matched.storm_id; d['match_confidence']=matched.match_confidence
def date(row,prefix):
 vals=[row.get(prefix+' Year'),row.get(prefix+' Month'),row.get(prefix+' Day')]
 if pd.isna(vals[0]): return None
 return pd.Timestamp(year=int(vals[0]),month=int(vals[1]) if pd.notna(vals[1]) else 1,day=int(vals[2]) if pd.notna(vals[2]) else 1).strftime('%Y-%m-%d')
rows=[]
for _,r in d.iterrows():
 damage=r.get("Total Damage ('000 US$)"); damage=float(damage)*1000 if pd.notna(damage) else None
 vals={'reported_event_id':str(r.get('DisNo.')),'storm_id':r.storm_id if pd.notna(r.storm_id) else None,'event_name':r.get('Event Name'),'country':r.get('Country'),'iso':r.get('ISO'),'admin_level':r.get('GADM Admin Units') if pd.notna(r.get('GADM Admin Units')) else r.get('Admin Units'),'start_date':date(r,'Start'),'end_date':date(r,'End'),'deaths':float(r['Total Deaths']) if pd.notna(r.get('Total Deaths')) else None,'injured':float(r['No. Injured']) if pd.notna(r.get('No. Injured')) else None,'affected':float(r['No. Affected']) if pd.notna(r.get('No. Affected')) else None,'homeless':float(r['No. Homeless']) if pd.notna(r.get('No. Homeless')) else None,'damage_usd':damage,'damage_currency_year':int(r['Start Year']) if pd.notna(r.get('Start Year')) else None,'source':'EM-DAT Public Table','data_status':'reported' if any(pd.notna(r.get(c)) for c in ['Total Deaths','No. Injured','No. Affected','No. Homeless',"Total Damage ('000 US$)"]) else 'not_reported','match_confidence':float(r.match_confidence)}
 rows.append(vals)
out=pd.DataFrame(rows); a.output.parent.mkdir(parents=True,exist_ok=True); out.to_parquet(a.output,index=False); out.to_json(a.output.with_suffix('.json'),orient='records',force_ascii=False); qa={'schema_version':'1.0','source_file':str(a.input),'storm_rows':len(out),'unique_reported_events':int(out.reported_event_id.nunique()),'matched_storm_rows':int(out.storm_id.notna().sum()),'matched_storm_ids':int(out[out.storm_id.notna()].storm_id.nunique()),'tropical_cyclone_filter':True,'classic_match_rows':out[out.storm_id.notna()].to_dict('records'),'missing_metric_rows':int((out.data_status=='not_reported').sum())}; (a.output.parent/'qa.json').write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps({k:qa[k] for k in ['storm_rows','unique_reported_events','matched_storm_rows','matched_storm_ids','missing_metric_rows']},ensure_ascii=False))
