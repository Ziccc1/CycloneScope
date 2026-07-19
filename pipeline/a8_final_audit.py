from pathlib import Path
import json,hashlib,datetime
import pandas as pd
root=Path(__file__).resolve().parents[1]; out=root/'output'; qa_dir=out/'qa'; qa_dir.mkdir(exist_ok=True)
version='a8-final-2026.07.19'; now=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
def load(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 return h.hexdigest().upper()
checks={}; issues=[]
m=load(root/'source-manifest-v2.json'); integ=[]
for r in m.get('records',[]):
 p=root/r['raw_path'] if r.get('raw_path') else None
 if p and p.exists() and p.is_file(): integ.append({'id':r['id'],'exists':True,'bytes_actual':p.stat().st_size,'bytes_manifest':r.get('bytes'),'sha256_match':(sha(p)==str(r.get('sha256','')).upper()) if r.get('sha256') else None})
 elif p and p.exists() and p.is_dir(): integ.append({'id':r['id'],'exists':True,'path_type':'directory','file_count':len(list(p.glob('*')))})
 elif p: integ.append({'id':r['id'],'exists':False})
checks['A1']={'manifest_records':len(m.get('records',[])),'raw_integrity':integ,'all_declared_raw_present':all(x['exists'] for x in integ)}
up=load(root/'source-manifest-upgrade.json'); upchecks=[]
for rr in up.get('records',[]):
    fs=rr.get('source_files',[])
    if isinstance(fs,str): fs=[fs]
    ex=[(root/x).exists() for x in fs]
    upchecks.append({'id':rr.get('id'),'status':rr.get('status'),'declared_files':len(fs),'files_present':sum(ex)})
checks['A1_upgrade']={'records':len(up.get('records',[])),'sources':upchecks}
for name in ['global-since1980','wp-since1980']:
 p=out/'processed'/f'ibtracs-{name}'; storms=pd.read_parquet(p/'catalog/storms.parquet'); tracks=pd.read_parquet(p/'tracks/track-points.parquet')
 checks.setdefault('A2',{})[name]={'storms':len(storms),'unique_storm_ids':int(storms['id'].nunique()),'track_rows':len(tracks),'track_storms':int(tracks.storm_id.nunique()),'duplicate_storm_ids':int(storms['id'].duplicated().sum()),'null_coordinates':int(tracks[['lon','lat']].isna().any(axis=1).sum())}
classic=load(out/'processed/classic/classic-storms.json'); checks['A3']={'classic_count':classic.get('count'),'item_count':len(classic.get('items',[])),'unique_ids':len({x['id'] for x in classic.get('items',[])})}
checks['A4']={'frame_manifest_exists':(out/'processed/era5/qa/era5-frame-manifest.json').exists(),'download_manifest_exists':(out/'processed/era5/downloads/manifest.json').exists(),'era5_case_count':len(load(out/'processed/era5/qa/era5-capability-matrix.json').get('items',[])) if (out/'processed/era5/qa/era5-capability-matrix.json').exists() else 0}
checks['A5']={'primary_population':'WorldPop Global2 R2025A 2025 constrained 100m','population_summary_exists':(out/'processed/impact/worldpop-2025-r2025a/population-summary.json').exists(),'exposure_exists':(out/'processed/impact/exposure-2025-r2025a/taiwan-exposure-summary.parquet').exists(),'hazard_max_exists':(out/'processed/impact/hazard/taiwan-hazard-max-wind.parquet').exists(),'hazard_time_exists':(out/'processed/impact/hazard/taiwan-hazard-time.parquet').exists()}
checks['A6']=load(out/'processed/taiwan/qa-interface.json'); checks['A6']['contract_exists']=(out/'processed/taiwan/A6-api-contract.json').exists()
checks['A7']={'global':load(out/'processed/features/global-since1980/qa.json'),'wp':load(out/'processed/features/wp-since1980/qa.json'),'contract_exists':(out/'processed/features/A7-api-contract.json').exists()}
api_paths=['output/processed/taiwan/zones.geojson','output/processed/taiwan/facilities/shelters.geojson','output/processed/taiwan/facilities/medical/medical.geojson','output/processed/taiwan/facilities/shelter-coverage-2025.json','output/processed/features/global-since1980/features-64.json','output/processed/features/global-since1980/shape-normalized.npy','output/processed/features/wp-since1980/features-64.json','output/processed/era5/qa/era5-frame-manifest.json','output/processed/impact/exposure-2025-r2025a/taiwan-exposure-summary.parquet']
checks['handoff']={'required_paths':{p:(root/p).exists() for p in api_paths},'all_required_paths_present':all((root/p).exists() for p in api_paths)}
checks['data_status']={'formal_primary':'observed_ibtracs_plus_era5','synthetic_data_policy':'demo fixtures are excluded from primary handoff'}
if not checks['A1']['all_declared_raw_present']: issues.append('A1 missing declared raw file')
if checks['A3']['classic_count']!=16: issues.append('A3 classic count mismatch')
if checks['A6'].get('shelter_count')!=5953: issues.append('A6 shelter count changed')
if not checks['A7']['global']['all_feature_lengths_64']: issues.append('A7 feature length check failed')
if not checks['handoff']['all_required_paths_present']: issues.append('handoff path missing')
result={'schema_version':'1.0.0','data_version':version,'generated_at':now,'status':'pass' if not issues else 'review','issues':issues,'checks':checks}
(qa_dir/'a8-final-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'DATA-VERSION.json').write_text(json.dumps({'data_version':version,'generated_at':now,'status':result['status'],'primary_population':'WorldPop Global2 R2025A 2025','primary_tracks':'IBTrACS v04r01 since1980; WP subset for regional analysis','synthetic_data_policy':'demo fixtures are excluded from primary handoff','qa':'output/qa/a8-final-audit.json'},ensure_ascii=False,indent=2),encoding='utf-8')
(out/'processed/API-INDEX.json').write_text(json.dumps({'schema_version':'1.0.0','data_version':version,'crs':'EPSG:4326','contracts':{'A6':'taiwan/A6-api-contract.json','A7':'features/A7-api-contract.json','ERA5':'era5/qa/wind-field-contract.json','population':'impact/worldpop-2025-r2025a/field-contract.json'},'qa':'../qa/a8-final-audit.json','handoff_contract':'HANDOFF-CONTRACT-v1.md','datasets':{'classic16_exposure':'impact/exposure-2025-r2025a/classic-16-exposure.parquet','zone_population':'taiwan/population/zones-population-2025.parquet','facilities_all':'taiwan/facilities/facilities-all.geojson','reported_impact':'impact/reported/reported-impact.parquet','reported_classic_summary':'impact/reported/classic-reported-impact.parquet','era5_capability':'era5/qa/era5-capability-matrix.json','roads_status':'taiwan/roads/README.md','tce_dat_exposure':'impact/tce-dat/tce-dat-exposure.parquet','tce_dat_classic':'impact/tce-dat/classic-tce-dat-exposure.parquet','taiwan_official_statistical_population':'taiwan/population/statistical-zones-population-official.parquet','taiwan_statistical_zones':'taiwan/population/statistical-zones.geojson','taiwan_admin_official_population':'taiwan/population/admin-official-population-spatial.parquet','road_nodes':'taiwan/roads/nodes.parquet','road_edges':'taiwan/roads/edges.parquet','facility_service_area':'taiwan/roads/facility-service-area.parquet'}},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'status':result['status'],'issues':issues,'data_version':version},ensure_ascii=False))
