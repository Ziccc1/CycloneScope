"""Normalize Taiwan official smallest statistical-area population XML."""
import argparse, json, re
from pathlib import Path
import pandas as pd
import xml.etree.ElementTree as ET

def roc_to_iso(s):
    m=re.search(r'(\d+)Y(\d+)M', str(s or ''))
    if not m: return None
    return f"{int(m.group(1))+1911:04d}-{int(m.group(2)):02d}-01"

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--raw-dir',required=True); ap.add_argument('--sources',required=True); ap.add_argument('--output',required=True); ap.add_argument('--qa',required=True); args=ap.parse_args()
    raw=Path(args.raw_dir); src=json.loads(Path(args.sources).read_text(encoding='utf-8'))
    rows=[]; files=[]
    for i,x in enumerate(src,1):
        fp=raw/f'smallest-{i:02d}.xml'; files.append(str(fp))
        if not fp.exists(): continue
        text=fp.read_text(encoding='utf-8',errors='replace')
        blocks=re.findall(r'<RowData>(.*?)</RowData>',text,re.S)
        for block in blocks:
            def val(k):
                m=re.search(rf'<{k}>(.*?)</{k}>',block,re.S); return m.group(1).strip() if m else None
            codebase=val('CODEBASE'); code2=val('CODE2');
            if not codebase: continue
            def num(k):
                try: return float(val(k)) if val(k) not in (None,'') else None
                except: return None
            rows.append({'stat_zone_id':codebase,'stat_zone_code':codebase,'stat_zone_name':None,'admin_zone_id':code2,'population_official':num('P_CNT'),'male_population':num('M_CNT'),'female_population':num('F_CNT'),'household_count':num('H_CNT'),'reference_date':roc_to_iso(val('INFO_TIME')),'source_dataset':'Taiwan MOI statistical-area population dataset 18681','data_status':'official_reported','source_file':fp.name})
    df=pd.DataFrame(rows).drop_duplicates(['stat_zone_id','reference_date']).sort_values(['reference_date','stat_zone_id'])
    out=Path(args.output); out.parent.mkdir(parents=True,exist_ok=True); df.to_parquet(out,index=False); df.to_json(out.with_suffix('.json'),orient='records',force_ascii=False,indent=2)
    qa={'status':'pass' if len(df)>0 else 'fail','files_expected':len(src),'files_present':sum(Path(f).exists() for f in files),'rows':len(df),'unique_stat_zones':int(df.stat_zone_id.nunique()) if len(df) else 0,'reference_dates':sorted(df.reference_date.dropna().unique().tolist()) if len(df) else [],'missing_population_rows':int(df.population_official.isna().sum()) if len(df) else 0}
    Path(args.qa).parent.mkdir(parents=True,exist_ok=True); Path(args.qa).write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(qa,ensure_ascii=False))
if __name__=='__main__': main()
