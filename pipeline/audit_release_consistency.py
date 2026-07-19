#!/usr/bin/env python3
"""Cross-check the checked-in handoff docs against the local processed-data worktree."""
from __future__ import annotations
import json
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT.parent / "CycloneScope-data-work"
DOCS = ROOT / "docs" / "data-processing"
checks=[]
def check(name, ok, detail):
    checks.append({"name": name, "status": "pass" if ok else "fail", "detail": detail})
api=json.loads((DOCS/"API-INDEX.json").read_text(encoding="utf-8"))
check("api.no_legacy_handoff", "HANDOFF-CONTRACT-v1.md" not in json.dumps(api), "no v1 path in API index")
check("api.current_contract", api.get("contract_version")=="2.1", str(api.get("contract_version")))
summary=json.loads((DOCS/"catalog"/"storms-summary.json").read_text(encoding="utf-8"))
check("catalog.count", summary.get("count")==4943 and len(summary.get("items",[]))==4943, str(summary.get("count")))
manifest=json.loads((DOCS/"source-manifest-v2.json").read_text(encoding="utf-8"))
ids={x.get("id") for x in manifest.get("records",[])}
check("sources.rescue", {"tw_rescue_units_5969","tw_emergency_centers_5969"}.issubset(ids), str(sorted(ids)))
source_text=(DOCS/"data-sources-final.md").read_text(encoding="utf-8")
check("sources.status_rescue", "共 787 条" in source_text and "5969" in source_text, "rescue is integrated")
check("sources.status_optional", "12849" in source_text and "后续扩展" in source_text, "shelter status remains optional")
handoff=(DOCS/"DATA-PROCESSING-HANDOFF-v2.1.md").read_text(encoding="utf-8")
for needle in ["16 场","13 个契约 manifest","665 个压缩 frame","8 场动态","4 场静态","4 场无风场","5 场台湾事件格网","787 救援/应变"]:
    check("handoff."+needle, needle in handoff, needle)
qa=json.loads((WORK/"output/qa/frozen-contract-2.1-validation.json").read_text(encoding="utf-8"))
check("qa.frozen", qa.get("passed")==32 and qa.get("failed")==0, f"passed={qa.get('passed')} failed={qa.get('failed')}")
pqa=json.loads((WORK/"output/qa/pydantic-contract-validation.json").read_text(encoding="utf-8"))
check("qa.pydantic", pqa.get("status")=="pass" and not pqa.get("errors"), str(pqa.get("counts")))
# Data counts from the actual processed worktree.
try:
    g=pd.read_parquet(WORK/"output/processed/ibtracs-global-since1980/tracks/track-points.parquet")
    check("data.global_track_points", len(g)==300007, str(len(g)))
    wp=pd.read_parquet(WORK/"output/processed/ibtracs-wp-since1980/tracks/track-points.parquet")
    check("data.wp_track_points", len(wp)==104304, str(len(wp)))
except Exception as exc:
    check("data.track_counts", False, str(exc))
# No stale report snapshots remain in the checked-in QA directory.
qa_files=[p.name for p in (ROOT/"docs"/"qa").iterdir() if p.is_file()]
check("docs.qa_single_entry", qa_files==["README.md"], str(qa_files))
report={"schema_version":"1.0","data_version":"a8-final-2026.07.19","status":"pass" if all(x["status"]=="pass" for x in checks) else "fail","checks":checks}
out=DOCS/"release-consistency-audit.json"
out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps(report,ensure_ascii=False,indent=2))
if report["status"]!="pass": raise SystemExit(1)