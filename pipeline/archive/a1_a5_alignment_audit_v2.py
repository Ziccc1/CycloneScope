from pathlib import Path
import json
import pandas as pd

root = Path.cwd()
read = lambda p: json.loads(Path(p).read_text(encoding="utf-8-sig"))
issues = []
def check(condition, code, detail):
    if not condition: issues.append({"code": code, "detail": detail})

manifest = read(root / "source-manifest-v2.json")
global_storms = pd.read_parquet(root / "output/processed/ibtracs-global-since1980/catalog/storms.parquet")
wp_storms = pd.read_parquet(root / "output/processed/ibtracs-wp/catalog/storms.parquet")
check(global_storms.season.max() >= 2025, "A2_NO_2025", "global IBTrACS missing 2025")
check(wp_storms.season.max() >= 2025, "A2_WP_NO_2025", "WP IBTrACS missing 2025")
classic = read(root / "output/processed/classic/classic-storms.json")
era5 = read(root / "output/processed/era5/downloads/manifest.json")
era5_ids = {x["storm_id"] for x in era5["files"] if x.get("storm_id")}
classic_ids = {x["id"] for x in classic["items"]}
check(era5_ids.issubset(classic_ids), "A3_A4_ORPHAN", "ERA5 storm absent from classic catalog")
check(all(x["era5_available"] == (x["id"] in era5_ids) for x in classic["items"]), "A3_A4_FLAG_MISMATCH", "classic ERA5 flags stale")
check(any(x.get("mode") == "global_demo" for x in era5["files"]), "A4_NO_GLOBAL", "global demo absent")
pop = read(root / "output/processed/impact/worldpop-2025-r2025a/population-summary.json")
check(pop.get("year") == 2025, "A5_PRIMARY_NOT_2025", "primary population is not 2025")
check(pop.get("variant") == "constrained_R2025A_v1", "A5_WRONG_VARIANT", "primary population is not R2025A")
check((root / "output/processed/impact/exposure-2025-r2025a/taiwan-exposure-summary.parquet").exists(), "A5_NO_2025_EXPOSURE", "2025 exposure output missing")
audit = {"schema_version":"1.0", "reference_population_year":2025, "reference_population_variant":"WorldPop Global2 R2025A v1 constrained 100m", "global_ibtracs_period":[int(global_storms.season.min()),int(global_storms.season.max())], "wp_ibtracs_period":[int(wp_storms.season.min()),int(wp_storms.season.max())], "global_storm_count":len(global_storms), "wp_storm_count":len(wp_storms), "classic_count":len(classic["items"]), "era5_file_count":era5["count"], "era5_case_count":len(era5_ids), "era5_has_global_demo":any(x.get("mode")=="global_demo" for x in era5["files"]), "primary_population_year":pop["year"], "issues":issues, "status":"pass" if not issues else "needs_adjustment"}
(root / "output/qa").mkdir(parents=True, exist_ok=True)
(root / "output/qa/a1-a5-alignment-2025.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(audit, ensure_ascii=False))
