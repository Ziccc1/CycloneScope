"""Create a small, browser-friendly C demo package from A's v2.1 delivery."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def export_tracks(source: Path, target: Path, storm_id: str) -> int:
    points: list[dict] = []
    with source.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            point = json.loads(line)
            if point.get("storm_id") == storm_id:
                points.append(point)
    points.sort(key=lambda item: item["time"])
    feature = {
        "type": "Feature",
        "properties": {"storm_id": storm_id},
        "geometry": {"type": "LineString", "coordinates": [[p["lon"], p["lat"]] for p in points]},
    }
    write_json(target / "tracks" / f"{storm_id}.geojson", {"type": "FeatureCollection", "features": [feature]})
    write_json(target / "tracks" / f"{storm_id}.points.json", points)
    return len(points)


def export_tracks_for_ids(source: Path, target: Path, storm_ids: set[str]) -> dict[str, int]:
    grouped: dict[str, list[dict]] = {storm_id: [] for storm_id in storm_ids}
    with source.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            point = json.loads(line)
            if point.get("storm_id") in grouped:
                grouped[point["storm_id"]].append(point)
    counts: dict[str, int] = {}
    for storm_id, points in grouped.items():
        points.sort(key=lambda item: item["time"])
        feature = {"type": "Feature", "properties": {"storm_id": storm_id}, "geometry": {"type": "LineString", "coordinates": [[p["lon"], p["lat"]] for p in points]}}
        write_json(target / "tracks" / f"{storm_id}.geojson", {"type": "FeatureCollection", "features": [feature]})
        write_json(target / "tracks" / f"{storm_id}.points.json", points)
        counts[storm_id] = len(points)
    return counts


def export_wind(processed: Path, target: Path, storm_id: str) -> int:
    source_manifest = processed / "era5" / "wind" / "storms" / storm_id / "manifest.json"
    manifest = read_json(source_manifest)
    frames_target = target / "wind" / storm_id / "frames"
    frames_target.mkdir(parents=True, exist_ok=True)
    exported_frames = []
    for frame in manifest["frames"]:
        relative = Path(frame["url"])
        source_frame = processed / "era5" / relative
        target_name = relative.name
        shutil.copy2(source_frame, frames_target / target_name)
        exported_frames.append({**frame, "url": f"frames/{target_name}"})
    write_json(target / "wind" / storm_id / "manifest.json", {**manifest, "frames": exported_frames})
    return len(exported_frames)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("delivery", type=Path, help="A delivery root containing output/processed")
    parser.add_argument("--storm-id", default="2009215N20133")
    parser.add_argument("--output", type=Path, default=Path("frontend/public/a-data-demo"))
    args = parser.parse_args()
    processed = args.delivery / "output" / "processed"
    target = args.output
    target.mkdir(parents=True, exist_ok=True)

    catalog = read_json(processed / "classic" / "classic-storms.json") if (processed / "classic" / "classic-storms.json").exists() else read_json(processed / "catalog" / "storms-summary.json")
    summary_fields = {"id", "name", "season", "basin", "start_time", "end_time", "max_wind_ms", "min_pressure_hpa", "duration_hours", "ace", "landfall_count", "classic", "classic_rank", "impact_score", "score_coverage", "reported_deaths", "reported_damage_usd_2024", "wind_available", "impact_available", "data_status", "source_ids"}
    items = []
    for raw in catalog["items"]:
        item = {key: raw.get(key) for key in summary_fields}
        item["source_ids"] = [item["source_ids"]] if isinstance(item["source_ids"], str) else (item["source_ids"] or [])
        if item["impact_score"] is None:
            item["score_coverage"] = 0.0
        items.append(item)
    write_json(target / "storms-summary.json", {"schema_version": "1.0", "data_status": catalog.get("data_status", "observed"), "source_ids": catalog.get("source_ids", []), "generated_at": catalog.get("generated_at"), "items": items, "count": len(items)})
    track_counts = export_tracks_for_ids(processed / "ibtracs-global-since1980" / "tracks" / "track-points.jsonl", target, {item["id"] for item in items})
    track_count = track_counts.get(args.storm_id, 0)
    frame_count = export_wind(processed, target, args.storm_id)
    (target / "taiwan").mkdir(parents=True, exist_ok=True)
    for name in ("zones.geojson", "facilities.geojson"):
        shutil.copy2(processed / "taiwan" / name, target / "taiwan" / name)
    impact = processed / "impact" / "storms" / args.storm_id / "grid.geojson"
    if impact.exists():
        (target / "impact").mkdir(parents=True, exist_ok=True)
        shutil.copy2(impact, target / "impact" / f"{args.storm_id}.geojson")
    write_json(target / "index.json", {"storm_id": args.storm_id, "track_points": track_count, "wind_frames": frame_count, "source": "CycloneScope data delivery v2.1"})
    print(f"Exported {track_count} track points and {frame_count} wind frames to {target}")


if __name__ == "__main__":
    main()
