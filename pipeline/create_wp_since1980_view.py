from pathlib import Path
import json
import pandas as pd

root = Path.cwd()
src = root / "output" / "processed" / "ibtracs-wp"
out = root / "output" / "processed" / "ibtracs-wp-since1980"
(out / "catalog").mkdir(parents=True, exist_ok=True)
(out / "tracks").mkdir(parents=True, exist_ok=True)
(out / "qa").mkdir(parents=True, exist_ok=True)
storms = pd.read_parquet(src / "catalog" / "storms.parquet")
storms["start_time"] = pd.to_datetime(storms["start_time"], utc=True)
storms = storms[storms["start_time"].dt.year >= 1980].copy()
tracks = pd.read_parquet(src / "tracks" / "track-points.parquet")
tracks = tracks[tracks["storm_id"].isin(storms["id"])].copy()
storms.to_parquet(out / "catalog" / "storms.parquet", index=False)
tracks.to_parquet(out / "tracks" / "track-points.parquet", index=False)
summary = {"schema_version": "1.0", "data_status": "observed", "source_ids": ["ibtracs_wp"], "period": "1980-present", "count": len(storms), "track_point_count": len(tracks)}
(out / "catalog" / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
(out / "qa" / "view.json").write_text(json.dumps({"period": "1980-present", "storm_count": len(storms), "track_point_count": len(tracks)}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False))
