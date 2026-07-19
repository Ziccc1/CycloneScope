from pathlib import Path
import json
import pandas as pd

root = Path.cwd()
for dataset, source_id in (("ibtracs-wp", "ibtracs_wp"), ("ibtracs-global-since1980", "ibtracs_since1980")):
    base = root / "output" / "processed" / dataset
    for path in [base / "catalog" / "storms.parquet", base / "tracks" / "track-points.parquet"]:
        if path.exists():
            frame = pd.read_parquet(path)
            if "source_ids" in frame.columns:
                frame["source_ids"] = frame["source_ids"].apply(lambda _: [source_id])
                frame.to_parquet(path, index=False)
    for path in [base / "catalog" / "storms-summary.json"]:
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            data["source_ids"] = [source_id]
            for item in data.get("items", []):
                item["source_ids"] = [source_id]
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print("normalized source ids")
