"""Create CycloneScope A-role artifacts from sample or normalized IBTrACS CSV data.

The script deliberately uses only the Python standard library so the first data
work package can be rerun before the repository environment is installed.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def parse_time(value: str) -> datetime:
    text = value.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def num(value: Any) -> float | None:
    if value is None or str(value).strip() in {"", "NA", "N/A", "-999", "-999.0"}:
        return None
    try:
        result = float(str(value).strip())
    except ValueError:
        return None
    return result if math.isfinite(result) else None


def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    rad = math.pi / 180
    a = math.sin((lat2 - lat1) * rad / 2) ** 2
    a += math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin((lon2 - lon1) * rad / 2) ** 2
    return 6371.0088 * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))


def unwrap_longitudes(points: list[dict[str, Any]]) -> None:
    if not points:
        return
    previous = float(points[0]["lon"])
    points[0]["lon_unwrapped"] = previous
    for point in points[1:]:
        current = float(point["lon"])
        while current - previous > 180:
            current -= 360
        while current - previous < -180:
            current += 360
        point["lon_unwrapped"] = round(current, 6)
        previous = current


def clean_track(points: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    dedup: dict[str, dict[str, Any]] = {}
    for raw in points:
        try:
            dt = parse_time(str(raw["time"]))
            lon, lat = num(raw.get("lon")), num(raw.get("lat"))
        except (KeyError, ValueError):
            warnings.append("invalid_time_or_coordinate")
            continue
        if lon is None or lat is None or not (-180 <= lon <= 180 and -90 <= lat <= 90):
            warnings.append("invalid_coordinate")
            continue
        key = iso(dt)
        dedup[key] = {
            "time": key,
            "lon": round(lon, 6),
            "lat": round(lat, 6),
            "wind_ms": num(raw.get("wind_ms")),
            "pressure_hpa": num(raw.get("pressure_hpa")),
            "category": raw.get("category"),
            "storm_status": raw.get("storm_status"),
            "source_agency": raw.get("source_agency"),
        }
    ordered = [dedup[key] for key in sorted(dedup)]
    unwrap_longitudes(ordered)
    for index, point in enumerate(ordered):
        if index == 0:
            point["moving_speed_kmh"] = None
            continue
        previous = ordered[index - 1]
        hours = (parse_time(point["time"]) - parse_time(previous["time"])).total_seconds() / 3600
        distance = haversine_km(previous["lon"], previous["lat"], point["lon"], point["lat"])
        speed = distance / hours if hours > 0 else None
        point["moving_speed_kmh"] = round(speed, 3) if speed is not None else None
        if speed is not None and speed > 150:
            warnings.append(f"unusually_fast_motion:{point['time']}:{speed:.1f}kmh")
    return ordered, sorted(set(warnings))


def interpolate(values: list[float], positions: list[float], target: float) -> float:
    if target <= positions[0]:
        return values[0]
    if target >= positions[-1]:
        return values[-1]
    for index in range(1, len(positions)):
        if target <= positions[index]:
            fraction = (target - positions[index - 1]) / (positions[index] - positions[index - 1])
            return values[index - 1] + fraction * (values[index] - values[index - 1])
    return values[-1]


def resample_track(points: list[dict[str, Any]], count: int = 64) -> list[list[float]]:
    if not points:
        return []
    if len(points) == 1:
        return [[points[0]["lon"], points[0]["lat"]] for _ in range(count)]
    distances = [0.0]
    for left, right in zip(points, points[1:]):
        distances.append(distances[-1] + haversine_km(left["lon"], left["lat"], right["lon"], right["lat"]))
    total = distances[-1]
    lons = [point["lon_unwrapped"] for point in points]
    lats = [point["lat"] for point in points]
    return [[round(interpolate(lons, distances, total * i / (count - 1)), 6),
             round(interpolate(lats, distances, total * i / (count - 1)), 6)]
            for i in range(count)]


def normalize_sample(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for record in records:
        track, warnings = clean_track(record.get("track", []))
        start = parse_time(record["start_time"])
        end = parse_time(record["end_time"])
        summary = {key: record.get(key) for key in (
            "id", "name", "season", "basin", "max_wind_ms", "min_pressure_hpa", "ace",
            "landfall_count", "classic", "classic_rank", "impact_score", "score_coverage",
            "reported_deaths", "reported_damage_usd_2024", "wind_available", "impact_available",
            "data_status", "source_ids")}
        summary.update({
            "start_time": iso(start), "end_time": iso(end),
            "duration_hours": round((end - start).total_seconds() / 3600, 3),
            "track_point_count": len(track), "track_warning_count": len(warnings),
        })
        result.append({"summary": summary, "track": track, "features": resample_track(track), "warnings": warnings})
    return result


def load_records(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        groups: dict[str, dict[str, Any]] = {}
        with path.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                storm_id = row.get("SID") or row.get("storm_id") or row.get("id")
                if not storm_id:
                    continue
                item = groups.setdefault(storm_id, {
                    "id": storm_id, "name": row.get("NAME") or row.get("name") or "UNNAMED",
                    "season": int(float(row.get("SEASON") or row.get("season") or 0)),
                    "basin": row.get("BASIN") or row.get("basin") or "WP", "track": [],
                    "data_status": "observed", "source_ids": ["ibtracs"], "classic": False,
                    "classic_rank": None, "impact_score": None, "score_coverage": 0,
                    "landfall_count": 0, "wind_available": True, "impact_available": False,
                })
                time = row.get("ISO_TIME") or row.get("time")
                if not time:
                    continue
                raw_wind = num(row.get("WMO_WIND"))
                # IBTrACS WMO_WIND is reported in knots; the project contract is m/s.
                # A normalized CSV with a wind_ms column is accepted as already converted.
                if raw_wind is not None and not row.get("wind_ms"):
                    raw_wind = raw_wind * 0.514444
                item["track"].append({"time": time, "lon": row.get("LON") or row.get("lon"),
                                      "lat": row.get("LAT") or row.get("lat"),
                                      "wind_ms": raw_wind if raw_wind is not None else row.get("wind_ms"),
                                      "pressure_hpa": row.get("WMO_PRES") or row.get("pressure_hpa")})
        for item in groups.values():
            cleaned, _ = clean_track(item["track"])
            if not cleaned:
                continue
            item["track"] = cleaned
            item["start_time"], item["end_time"] = cleaned[0]["time"], cleaned[-1]["time"]
            winds = [p["wind_ms"] for p in cleaned if p["wind_ms"] is not None]
            pressures = [p["pressure_hpa"] for p in cleaned if p["pressure_hpa"] is not None]
            item["max_wind_ms"] = max(winds) if winds else None
            item["min_pressure_hpa"] = min(pressures) if pressures else None
        return list(groups.values())
    return json.loads(path.read_text(encoding="utf-8"))


def write_outputs(records: list[dict[str, Any]], output: Path) -> None:
    (output / "catalog").mkdir(parents=True, exist_ok=True)
    (output / "tracks").mkdir(parents=True, exist_ok=True)
    (output / "qa").mkdir(parents=True, exist_ok=True)
    summaries = [record["summary"] for record in records]
    metadata = {"schema_version": "1.0", "data_status": "mixed", "source_ids": sorted({s for r in summaries for s in (r.get("source_ids") or [])}),
                "generated_at": iso(datetime.now(timezone.utc)), "count": len(summaries), "items": summaries}
    (output / "catalog" / "storms-summary.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    with (output / "tracks" / "track-points.jsonl").open("w", encoding="utf-8") as handle:
        for record in records:
            for point in record["track"]:
                handle.write(json.dumps({"storm_id": record["summary"]["id"], **point}, ensure_ascii=False) + "\n")
    features = [{"storm_id": r["summary"]["id"], "point_count": len(r["features"]), "points": r["features"]} for r in records]
    (output / "tracks" / "features.json").write_text(json.dumps(features, ensure_ascii=False, indent=2), encoding="utf-8")
    missing = Counter()
    warning_rows = []
    for record in records:
        for key, value in record["summary"].items():
            if value is None:
                missing[key] += 1
        warning_rows.append({"storm_id": record["summary"]["id"], "warnings": record["warnings"]})
    qa = {"record_count": len(records), "unique_storm_ids": len({r["summary"]["id"] for r in records}),
          "missing_count_by_field": dict(sorted(missing.items())), "warnings": warning_rows,
          "checks": {"duplicate_storm_id": len(records) != len({r["summary"]["id"] for r in records}),
                     "all_features_have_64_points": all(len(r["features"]) == 64 for r in records)}}
    (output / "qa" / "data-profile.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "qa" / "manual-checks.md").write_text("""# 浜哄伐鎶芥煡娓呭崟\n\n- [ ] 闅忔満鎶芥煡 3 鍦烘皵鏃嬬殑棣栨湯鏃堕棿銆佷綅缃拰鏈€澶ч閫焅n- [ ] 鏀惧ぇ鏃ユ湡鍙樻洿绾块檮杩戣建杩癸紝纭娌℃湁璺ㄥ湴鍥鹃敊璇洿绾縗n- [ ] 鎶芥煡 64 鐐归噸閲囨牱涓庡師杞ㄨ抗鐨勬柟鍚戣秼鍔夸竴鑷碶n- [ ] 姝ｅ紡鏁版嵁琛ュ厖鏉ユ簮鐗堟湰銆佷笅杞芥棩鏈熷拰璁稿彲璇乗n- [ ] 灏?`synthetic_fixture` 涓?`observed` 鍦ㄧ晫闈笂鏄庣‘鍖哄垎\n""", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    write_outputs(normalize_sample(load_records(args.input)), args.output)
    print(f"processed {args.input} -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
