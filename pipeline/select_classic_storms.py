"""Select a transparent multi-basin classic-storm catalog from cleaned IBTrACS."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


SELECTED = [
    "1980214N11330",  # Allen / NA
    "1988253N12306",  # Gilbert / NA
    "2005236N23285",  # Katrina / NA
    "2017260N12310",  # Maria / NA
    "2019236N10314",  # Dorian / NA
    "2015293N13266",  # Patricia / EP
    "2008117N11090",  # Nargis / NI
    "2019063S18038",  # Idai / SI
    "2023036S12117",  # Freddy / SI
    "2011028S13180",  # Yasi / SP
    "2014004S17183",  # Ian / SP
    "2013306N07162",  # Haiyan / WP
    "2009215N20133",  # Morakot / WP
    "2018250N12170",  # Mangkhut / WP
    "2020299N11144",  # Goni / WP
    "2019278N16165",  # Hagibis / WP
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    by_id = {item["id"]: item for item in catalog["items"]}
    missing = [storm_id for storm_id in SELECTED if storm_id not in by_id]
    if missing:
        raise SystemExit(f"selected storm IDs missing from catalog: {missing}")
    selected = []
    max_wind = max(by_id[sid]["max_wind_ms"] for sid in SELECTED)
    max_duration = max(by_id[sid]["duration_hours"] for sid in SELECTED)
    for rank, storm_id in enumerate(SELECTED, start=1):
        item = dict(by_id[storm_id])
        completeness_fields = [item.get("max_wind_ms"), item.get("min_pressure_hpa"), item.get("ace")]
        completeness = sum(value is not None for value in completeness_fields) / len(completeness_fields)
        intensity = (item["max_wind_ms"] or 0) / max_wind
        duration = (item["duration_hours"] or 0) / max_duration
        taiwan_relevance = 1.0 if item["basin"] == "WP" else 0.25
        item.update({
            "classic": True,
            "classic_rank": rank,
            "selection_components": {
                "intensity": round(intensity, 4),
                "duration": round(duration, 4),
                "field_completeness": round(completeness, 4),
                "taiwan_relevance": taiwan_relevance,
            },
            "score_coverage": round(completeness, 4),
            "era5_available": False,
            "population_available": False,
            "facility_available": False,
            "selection_status": "candidate_pending_downstream_data",
        })
        selected.append(item)
    selected.sort(key=lambda item: item["classic_rank"])
    args.output.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema_version": "1.0",
        "data_status": "observed_plus_pending_downstream",
        "source_ids": ["ibtracs_since1980"],
        "selection_rule": "multi-basin, Taiwan relevance, intensity, duration, field completeness; downstream coverage pending",
        "count": len(selected),
        "items": selected,
    }
    (args.output / "classic-storms.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    basin_counts = {}
    for item in selected:
        basin_counts[item["basin"]] = basin_counts.get(item["basin"], 0) + 1
    notes = [
        "# A3 经典案例选择说明", "", f"共选择 {len(selected)} 场，覆盖海盆：" + ", ".join(f"{key}={value}" for key, value in sorted(basin_counts.items())), "",
        "选择原则：优先保证多海盆、台湾相关案例、强度/持续时间可比较和字段完整度；不把知名度或报告灾损直接当作排序依据。", "",
        "ERA5、人口和设施字段目前标记为 pending，待后续数据接入后更新覆盖状态。", "",
        "| rank | storm_id | name | season | basin | max wind m/s | min pressure hPa | ACE | Taiwan relevance |",
        "|---:|---|---|---:|---|---:|---:|---:|---:|",
    ]
    for item in selected:
        notes.append(f"| {item['classic_rank']} | {item['id']} | {item['name']} | {item['season']} | {item['basin']} | {item['max_wind_ms']} | {item['min_pressure_hpa']} | {item['ace']} | {item['selection_components']['taiwan_relevance']} |")
    (args.output / "selection-notes.md").write_text("\n".join(notes) + "\n", encoding="utf-8")
    print(json.dumps({"count": len(selected), "basins": basin_counts}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
