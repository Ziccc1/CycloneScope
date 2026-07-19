"""Export the processed JSON artifacts to the team-plan Parquet contract."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    args = parser.parse_args()
    catalog = json.loads((args.input / "catalog" / "storms-summary.json").read_text(encoding="utf-8"))
    tracks = [json.loads(line) for line in (args.input / "tracks" / "track-points.jsonl").read_text(encoding="utf-8").splitlines()]
    catalog_frame = pd.DataFrame(catalog["items"])
    track_frame = pd.DataFrame(tracks)
    track_frame["time"] = pd.to_datetime(track_frame["time"], utc=True)
    catalog_frame["start_time"] = pd.to_datetime(catalog_frame["start_time"], utc=True)
    catalog_frame["end_time"] = pd.to_datetime(catalog_frame["end_time"], utc=True)
    catalog_frame.to_parquet(args.input / "catalog" / "storms.parquet", index=False)
    track_frame.to_parquet(args.input / "tracks" / "track-points.parquet", index=False)
    print({"storms": len(catalog_frame), "track_points": len(track_frame)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
