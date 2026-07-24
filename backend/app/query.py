from __future__ import annotations

from collections.abc import Iterable

from fastapi import HTTPException


BoundsTuple = tuple[float, float, float, float]


def parse_bbox(value: str | None) -> BoundsTuple | None:
    if value is None:
        return None
    try:
        west, south, east, north = (float(part) for part in value.split(","))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=422, detail="bbox must be west,south,east,north"
        ) from None
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise HTTPException(status_code=422, detail="bbox coordinates are invalid")
    return west, south, east, north


def point_in_bounds(lon: float, lat: float, bounds: BoundsTuple | None) -> bool:
    if bounds is None:
        return True
    west, south, east, north = bounds
    return west <= lon <= east and south <= lat <= north


def iter_positions(value: object) -> Iterable[tuple[float, float]]:
    if (
        isinstance(value, (list, tuple))
        and len(value) == 2
        and all(isinstance(item, (int, float)) for item in value)
    ):
        yield float(value[0]), float(value[1])
        return
    if isinstance(value, (list, tuple)):
        for item in value:
            yield from iter_positions(item)


def geometry_intersects_bounds(
    coordinates: object, bounds: BoundsTuple | None
) -> bool:
    if bounds is None:
        return True
    positions = list(iter_positions(coordinates))
    if not positions:
        return False
    west, south, east, north = bounds
    geometry_west = min(position[0] for position in positions)
    geometry_east = max(position[0] for position in positions)
    geometry_south = min(position[1] for position in positions)
    geometry_north = max(position[1] for position in positions)
    return not (
        geometry_east < west
        or geometry_west > east
        or geometry_north < south
        or geometry_south > north
    )
