#!/usr/bin/env python3
"""Run the frozen v2.1 contract audit without regenerating legacy indexes."""
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
runpy.run_path(str(ROOT / "pipeline" / "validate_frozen_contract.py"), run_name="__main__")