"""Template for downloading a small ERA5 u10/v10 request after CDS setup.

This file is intentionally not executed until the user configures a CDS
account and installs cdsapi. It creates one regional request per selected storm.
"""
from __future__ import annotations

from pathlib import Path


def build_request(year: int, month: int, days: list[str], hours: list[str], area: list[float], target: Path) -> dict:
    return {
        "product_type": "reanalysis",
        "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
        "year": [str(year)],
        "month": [f"{month:02d}"],
        "day": days,
        "time": hours,
        "area": area,  # north, west, south, east
        "format": "netcdf",
        "target": str(target),
    }


if __name__ == "__main__":
    raise SystemExit("Configure CDS credentials and call build_request from the A4 runner first.")
