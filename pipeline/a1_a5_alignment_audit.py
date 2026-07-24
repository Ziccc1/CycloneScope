from pathlib import Path
import json
import pandas as pd

root = Path.cwd()
issues = []
manifest = json.loads((root / "source-manifest-v2.json").read_text(encoding="utf-8"))
records = {x["id"]: x for x in manifest["records"]}

def check(condition, code, detail):
    if not condition:
        issues.append({"code": code, "detail": detail})

global_storms = pd.read_parquet(root / "output" / "processed" / "ibtracs-global-since1980" / "catalog" / "storms.parquet")
wp_storms = pd.read_parquet(root / "output" / "processed" / "ibtracs-wp" / "catalog" / "storms.parquet")
check(global_storms["season"].max() >= 2025, "A2_NO_2025", "global IBTrACS does not contain 2025")
check(wp_storms["season"].max() >= 2025, "A2_WP_NO_2025", "WP IBTrACS does not contain 2025")

classic = json.loads((root / "output" / "processed" / "classic" / "classic-storms.json").read_text(encoding="utf-8"))
era5 = json.loads((root / "output" / "processed" / "era5" / "downloads" / "manifest.json").read_text(encoding="utf-8"))
era5_ids = {x["storm_id"] for x in era5["files"] if x.get("storm_id")}
classic_ids = {x["id"] for x in classic["items"]}
check(era5_ids.issubset(classic_ids), "A3_A4_ORPHAN", "ERA5 file references a storm absent from classic catalog")
check(all(x["era5_available"] == (x["id"] in era5_ids) for x in classic["items"]), "A3_A4_FLAG_MISMATCH", "classic era5_available flags are stale")
check(any(x.get("mode") == "global_demo" for x in era5["files"]), "A4_NO_GLOBAL", "no global demo in ERA5 manifest")

pop2025 = json.loads((root / "output" / "processed" / "impact" / "worldpop-2025-r2025a" / "population-summary.json").read_text(encoding="utf-8"))
check(pop2025.get("year") == 2025, "A5_PRIMARY_NOT_2025", "primary population summary is not 2025")
check(pop2025.get("variant") == "constrained_R2025A_v1", "A5_WRONG_VARIANT", "primary population is not R2025A constrained")
check((root / "output" / "processed" / "impact" / "exposure-2025-r2025a" / "taiwan-exposure-summary.parquet").exists(), "A5_NO_2025_EXPOSURE", "2025 exposure output missing")

audit = {
    "schema_version": "1.0",
    "reference_population_year": 2025,
    "reference_population_variant": "WorldPop Global2 R2025A v1 constrained 100m",
    "global_ibtracs_period": [int(global_storms.season.min()), int(global_storms.season.max())],
    "wp_ibtracs_period": [int(wp_storms.season.min()), int(wp_storms.season.max())],
    "global_storm_count": int(len(global_storms)),
    "wp_storm_count": int(len(wp_storms)),
    "classic_count": int(len(classic["items"])),
    "era5_file_count": int(era5["count"]),
    "era5_case_count": int(len(era5_ids)),
    "era5_has_global_demo": any(x.get("mode") == "global_demo" for x in era5["files"]),
    "primary_population_year": int(pop2025["year"]),
    "issues": issues,
    "status": "pass" if not issues else "needs_adjustment"
}
out = root / "output" / "qa"
out.mkdir(parents=True, exist_ok=True)
(out / "a1-a5-alignment-2025.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(audit, ensure_ascii=False))
