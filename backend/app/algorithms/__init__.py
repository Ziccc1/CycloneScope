"""Pure C-side algorithms with no HTTP, database, or repository dependencies."""

from .facilities import Facility, FacilityCoverage, allocate_population, haversine_km
from .trajectory import (
    TrackPoint,
    normalize_shape,
    resample_track,
    trajectory_distance,
)
from .wind import WindFrame, advect_particle, bilinear_vector

__all__ = [
    "Facility",
    "FacilityCoverage",
    "TrackPoint",
    "WindFrame",
    "advect_particle",
    "allocate_population",
    "bilinear_vector",
    "haversine_km",
    "normalize_shape",
    "resample_track",
    "trajectory_distance",
]
