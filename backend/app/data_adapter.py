<<<<<<< HEAD
﻿from __future__ import annotations
=======
from __future__ import annotations
>>>>>>> origin/main

import os
import math
from datetime import datetime
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROCESSED_ROOT = PROJECT_ROOT / "backend" / "data" / "processed"


def _processed_candidates(path: Path) -> list[Path]:
    path = path.expanduser()
    return [path / "output" / "processed", path / "processed", path]


def resolve_processed_root(configured: str | Path | None = None) -> Path:
    """Resolve A's delivery package to its output/processed directory."""
    candidates: list[Path] = []
    value = configured or os.getenv("CYCLONESCOPE_DATA_ROOT")
    if value:
        configured_candidates = _processed_candidates(Path(value))
        for candidate in configured_candidates:
            if candidate.is_dir():
                return candidate.resolve()
        candidates.extend(configured_candidates)
    candidates.extend(
        [
            PROJECT_ROOT / "output" / "processed",
            PROJECT_ROOT.parent / "CycloneScope-data-work" / "output" / "processed",
<<<<<<< HEAD
            PROJECT_ROOT.parent / "CycloneScope-data-delivery-v2.1" / "output" / "processed",
=======
>>>>>>> origin/main
            DEFAULT_PROCESSED_ROOT,
        ]
    )
    for candidate in candidates:
        if candidate.is_dir() and any(
            (candidate / name).exists()
            for name in ("catalog", "ibtracs-global-since1980", "era5", "taiwan")
        ):
            return candidate.resolve()
    if value:
        # Preserve the configured location in errors even when the package is absent.
        return _processed_candidates(Path(value))[0].resolve()
    return DEFAULT_PROCESSED_ROOT.resolve()


def read_parquet_rows(
    path: Path,
    *,
    columns: list[str] | None = None,
    filters: list[tuple[str, str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Read A's Parquet products lazily so fixture mode stays dependency-light."""
    try:
        import pyarrow.parquet as parquet
    except ImportError as error:
        raise RuntimeError(
            "Processed Parquet data requires pyarrow; run scripts/bootstrap.ps1."
        ) from error
    table = parquet.read_table(path, columns=columns, filters=filters)
    return [_normalize_row(row) for row in table.to_pylist()]


def _normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: _normalize_value(value) for key, value in row.items()}


def _normalize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (list, tuple)):
        return [_normalize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _normalize_value(item) for key, item in value.items()}
    return value
<<<<<<< HEAD

=======
>>>>>>> origin/main
