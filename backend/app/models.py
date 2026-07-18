from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    facilities: Mapped[list["Facility"]] = relationship(
        back_populates="scenario", cascade="all, delete-orphan"
    )


class Facility(Base):
    __tablename__ = "facilities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(ForeignKey("scenarios.id"), index=True)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    capacity_value: Mapped[int] = mapped_column(Integer, default=0)
    capacity_unit: Mapped[str] = mapped_column(String(40), default="people")
    service_radius_km: Mapped[float] = mapped_column(Float, default=5.0)
    budget_points: Mapped[int] = mapped_column(Integer, default=1)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)

    scenario: Mapped[Scenario] = relationship(back_populates="facilities")
