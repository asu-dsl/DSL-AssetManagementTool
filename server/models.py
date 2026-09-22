from datetime import datetime

from pydantic import BaseModel, Field


class AssetMetadata(BaseModel):
    title: str = ""
    author: str = ""
    tags: list[str] = Field(default_factory=list)
    version: str = ""
    notes: str = ""
    customFields: dict[str, str] = Field(default_factory=dict)


class AssetIn(BaseModel):
    fileName: str
    filePath: str
    fileSize: int
    fileType: str
    lastModified: datetime
    metadata: AssetMetadata = Field(default_factory=AssetMetadata)


class AssetOut(AssetIn):
    id: str = Field(alias="_id")
    createdAt: datetime
    updatedAt: datetime

    model_config = {"populate_by_name": True}
