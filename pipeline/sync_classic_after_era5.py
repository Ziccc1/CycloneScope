from pathlib import Path
import json

root = Path.cwd()
classic_path = root / "output" / "processed" / "classic" / "classic-storms.json"
manifest_path = root / "output" / "processed" / "era5" / "downloads" / "manifest.json"
data = json.loads(classic_path.read_text(encoding="utf-8"))
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
available = {x["storm_id"] for x in manifest["files"]}
for item in data["items"]:
    item["source_ids"] = ["ibtracs_since1980"]
    item["era5_available"] = item["id"] in available
    item["population_available"] = False
    item["facility_available"] = False
    item["selection_status"] = "ready_for_era5_and_track_analysis" if item["era5_available"] else "candidate_pending_era5"
data["source_ids"] = ["ibtracs_since1980", "era5_single_levels"]
data["data_status"] = "observed_ibtracs_plus_era5"
data["selection_rule"] = "multi-basin, Taiwan relevance, intensity, duration, field completeness; ERA5 coverage synchronized after A4"
data["era5_coverage"] = {"available_count": sum(x["era5_available"] for x in data["items"]), "total_count": len(data["items"]), "file_count": len(manifest["files"])}
classic_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(data["era5_coverage"], ensure_ascii=False))
