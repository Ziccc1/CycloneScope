from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from .schemas import DataSource, StormDetail, WindFrame


DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "samples"


@lru_cache(maxsize=1)
def load_storms() -> list[dict[str, Any]]:
    payload = json.loads((DATA_DIR / "storms.json").read_text(encoding="utf-8"))
    models = TypeAdapter(list[StormDetail]).validate_python(payload)
    return [model.model_dump(mode="json") for model in models]


@lru_cache(maxsize=1)
def load_sources() -> list[dict[str, Any]]:
    payload = json.loads((DATA_DIR / "data-sources.json").read_text(encoding="utf-8"))
    models = TypeAdapter(list[DataSource]).validate_python(payload)
    return [model.model_dump(mode="json") for model in models]


@lru_cache(maxsize=1)
def load_sample_wind() -> dict[str, Any]:
    payload = json.loads((DATA_DIR / "wind-demo.json").read_text(encoding="utf-8"))
    return WindFrame.model_validate(payload).model_dump(mode="json")


def get_storm(storm_id: str) -> dict[str, Any] | None:
    return next((storm for storm in load_storms() if storm["id"] == storm_id), None)
