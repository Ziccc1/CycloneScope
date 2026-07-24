from __future__ import annotations

from datetime import datetime

from pydantic import AnyHttpUrl, Field, model_validator

from .common import ContractModel


class DataSource(ContractModel):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9][a-z0-9_-]*$")
    name: str = Field(min_length=1, max_length=160)
    url: AnyHttpUrl
    purpose: str = Field(min_length=1, max_length=500)
    status: str = Field(min_length=1, max_length=80)
    license_name: str | None = Field(default=None, max_length=160)
    accessed_at: datetime | None = None


class DataSourceListResponse(ContractModel):
    items: list[DataSource]
    count: int = Field(ge=0)

    @model_validator(mode="after")
    def count_matches_items(self) -> "DataSourceListResponse":
        if self.count != len(self.items):
            raise ValueError("count must equal the number of items")
        return self
