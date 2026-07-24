#!/usr/bin/env python3
"""Compatibility entry point for the v2.1 frozen contract audit."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
qa = ROOT / "output" / "qa" / "frozen-contract-2.1-validation.json"
if not qa.exists():
    raise SystemExit("Run pipeline/validate_frozen_contract.py first")
report = json.loads(qa.read_text(encoding="utf-8"))
result = {
    "schema_version": "1.0",
    "data_version": report.get("data_version", "a8-final-2026.07.19"),
    "status": report.get("status"),
    "passed": report.get("passed", 0),
    "failed": report.get("failed", 0),
    "known_limits": report.get("known_limits", []),
}
( ROOT / "output" / "qa").mkdir(parents=True, exist_ok=True)
(ROOT / "output" / "qa" / "upgrade-audit.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False))