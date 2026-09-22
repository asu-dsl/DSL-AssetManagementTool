from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from pymongo.errors import ServerSelectionTimeoutError

from db import assets_collection
from models import AssetIn, AssetOut

app = FastAPI(title="DSL Asset Management API")


def _serialize(doc: dict) -> dict:
    doc["_id"] = str(doc["_id"])
    return doc


@app.get("/health")
def health():
    try:
        assets_collection.database.client.admin.command("ping")
    except ServerSelectionTimeoutError:
        raise HTTPException(status_code=503, detail="MongoDB unreachable")
    return {"status": "ok"}


@app.put("/assets", response_model=AssetOut, response_model_by_alias=True)
def upsert_asset(asset: AssetIn):
    now = datetime.now(timezone.utc)
    doc = asset.model_dump()
    result = assets_collection.find_one_and_update(
        {"filePath": asset.filePath},
        {"$set": doc, "$setOnInsert": {"createdAt": now}, "$currentDate": {"updatedAt": True}},
        upsert=True,
        return_document=True,
    )
    return _serialize(result)


@app.get("/assets", response_model=list[AssetOut], response_model_by_alias=True)
def list_assets(tag: str | None = None, search: str | None = None):
    query: dict = {}
    if tag:
        query["metadata.tags"] = tag
    if search:
        query["fileName"] = {"$regex": search, "$options": "i"}
    return [_serialize(doc) for doc in assets_collection.find(query)]


@app.get("/assets/by-path", response_model=AssetOut, response_model_by_alias=True)
def get_asset_by_path(path: str):
    doc = assets_collection.find_one({"filePath": path})
    if not doc:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _serialize(doc)


@app.delete("/assets/by-path")
def delete_asset_by_path(path: str):
    result = assets_collection.delete_one({"filePath": path})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"status": "deleted"}
