import logging
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pymongo.errors import ServerSelectionTimeoutError

from db import assets_collection
from images import router as images_router
from models import AssetIn, AssetOut

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ams.assets")

app = FastAPI(title="DSL Asset Management API")
app.include_router(images_router)
app.mount("/ui", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="ui")


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
    logger.info("CREATE/UPDATE asset requested: filePath=%s", asset.filePath)
    now = datetime.now(timezone.utc)
    doc = asset.model_dump()
    result = assets_collection.find_one_and_update(
        {"filePath": asset.filePath},
        {"$set": doc, "$setOnInsert": {"createdAt": now}, "$currentDate": {"updatedAt": True}},
        upsert=True,
        return_document=True,
    )
    logger.info("CREATE/UPDATE asset succeeded: id=%s filePath=%s", result["_id"], asset.filePath)
    return _serialize(result)


@app.get("/assets", response_model=list[AssetOut], response_model_by_alias=True)
def list_assets(tag: str | None = None, search: str | None = None):
    logger.info("LIST assets requested: tag=%s search=%s", tag, search)
    query: dict = {}
    if tag:
        query["metadata.tags"] = tag
    if search:
        query["fileName"] = {"$regex": search, "$options": "i"}
    results = [_serialize(doc) for doc in assets_collection.find(query)]
    logger.info("LIST assets returned %d result(s)", len(results))
    return results


@app.get("/assets/by-path", response_model=AssetOut, response_model_by_alias=True)
def get_asset_by_path(path: str):
    logger.info("READ asset requested: filePath=%s", path)
    doc = assets_collection.find_one({"filePath": path})
    if not doc:
        logger.warning("READ asset failed, not found: filePath=%s", path)
        raise HTTPException(status_code=404, detail="Asset not found")
    return _serialize(doc)


@app.delete("/assets/by-path")
def delete_asset_by_path(path: str):
    logger.info("DELETE asset requested: filePath=%s", path)
    result = assets_collection.delete_one({"filePath": path})
    if result.deleted_count == 0:
        logger.warning("DELETE asset failed, not found: filePath=%s", path)
        raise HTTPException(status_code=404, detail="Asset not found")
    logger.info("DELETE asset succeeded: filePath=%s", path)
    return {"status": "deleted"}
