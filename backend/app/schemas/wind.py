from __future__ import annotations

import math
from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import Field, field_validator, model_validator

from .common import ContractMetadata, ContractModel, GeoBounds


class WindMode(str, Enum):
    GLOBAL = "global"
    STORM = "storm"


class WindCapability(str, Enum):
    DYNAMIC = "dynamic"
    STATIC = "static"


class WindFrameReference(ContractModel):
    time: datetime
    url: str = Field(min_length=1, max_length=500)
    byte_size: int | None = Field(default=None, ge=0)
    sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class WindManifest(ContractMetadata):
    dataset_id: str = Field(min_length=1, max_length=120)
    mode: WindMode
    storm_id: str | None = Field(default=None, max_length=40)
    capability: WindCapability | None = None
    units: Literal["m/s"] = "m/s"
    grid_order: Literal[
        "north_to_south_west_to_east_row_major"
    ] = "north_to_south_west_to_east_row_major"
    bounds: GeoBounds
    resolution_degrees: float = Field(gt=0, le=5)
    width: int = Field(ge=2, le=10000)
    height: int = Field(ge=2, le=10000)
    frames: list[WindFrameReference] = Field(min_length=1)

    @model_validator(mode="after")
    def manifest_is_consistent(self) -> "WindManifest":
        if self.mode == WindMode.STORM and not self.storm_id:
            raise ValueError("storm mode requires storm_id")
        if self.mode == WindMode.GLOBAL and self.storm_id is not None:
            raise ValueError("global mode cannot include storm_id")
        times = [frame.time for frame in self.frames]
        if times != sorted(times) or len(times) != len(set(times)):
            raise ValueError("wind frame times must be unique and ordered")
        if self.bounds.crosses_antimeridian:
            longitude_span = (180 - self.bounds.west) + (self.bounds.east + 180)
        else:
            longitude_span = self.bounds.east - self.bounds.west
        latitude_span = self.bounds.north - self.bounds.south
        expected_width = round(longitude_span / self.resolution_degrees) + 1
        expected_height = round(latitude_span / self.resolution_degrees) + 1
        if self.width != expected_width or self.height != expected_height:
            raise ValueError(
                "width and height must match bounds and resolution for an inclusive grid"
            )
        return self


class WindFrame(ContractModel):
    schema_version: Literal["1.0"] = "1.0"
    dataset_id: str = Field(min_length=1, max_length=120)
    time: datetime
    width: int = Field(ge=2, le=10000)
    height: int = Field(ge=2, le=10000)
    u: list[float | None]
    v: list[float | None]
    missing_value: float | None = None

    @model_validator(mode="after")
    def arrays_match_grid(self) -> "WindFrame":
        expected = self.width * self.height
        if len(self.u) != expected or len(self.v) != expected:
            raise ValueError("u and v lengths must equal width * height")
        for component in (self.u, self.v):
            if any(value is not None and not math.isfinite(value) for value in component):
                raise ValueError("wind components must be finite numbers or null")
        return self
