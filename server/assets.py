import logging
import mimetypes
import uuid
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from categories import EXTENSION_TO_CATEGORY
from db import STORAGE_DIR, assets_collection

logger = logging.getLogger("ams.assets")
router = APIRouter(prefix="/assets", tags=["assets"])


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


def _get_object_id(asset_id: str) -> ObjectId:
    try:
        return ObjectId(asset_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid asset id")


@router.post("")
async def upload_asset(
    file: UploadFile = File(...),
    title: str = Form(""),
    author: str = Form(""),
    tags: str = Form(""),
    version: str = Form(""),
    notes: str = Form(""),
):
    logger.info("CREATE asset requested: filename=%s contentType=%s", file.filename, file.content_type)

    ext = Path(file.filename or "").suffix.lower()
    category = EXTENSION_TO_CATEGORY.get(ext)
    if category is None:
        logger.warning("CREATE asset rejected: unsupported extension=%s filename=%s", ext, file.filename)
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext or '(none)'}")

    contents = await file.read()
    category_dir = STORAGE_DIR / category
    category_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{ext}"
    (category_dir / stored_name).write_bytes(contents)

    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"

    now = datetime.now(timezone.utc)
    doc = {
        "storedName": stored_name,
        "originalFilename": file.filename,
        "contentType": content_type,
        "category": category,
        "size": len(contents),
        "metadata": {
            "title": title,
            "author": author,
            "tags": [t.strip() for t in tags.split(",") if t.strip()],
            "version": version,
            "notes": notes,
        },
        "createdAt": now,
        "updatedAt": now,
    }
    doc["_id"] = assets_collection.insert_one(doc).inserted_id
    logger.info(
        "CREATE asset succeeded: id=%s category=%s storedName=%s size=%d",
        doc["_id"], category, stored_name, doc["size"],
    )
    return _serialize(doc)


@router.get("")
def list_assets(category: str | None = None, tag: str | None = None, search: str | None = None):
    logger.info("LIST assets requested: category=%s tag=%s search=%s", category, tag, search)
    query: dict = {}
    if category:
        query["category"] = category
    if tag:
        query["metadata.tags"] = tag
    if search:
        query["originalFilename"] = {"$regex": search, "$options": "i"}
    results = [_serialize(doc) for doc in assets_collection.find(query).sort("createdAt", -1)]
    logger.info("LIST assets returned %d result(s)", len(results))
    return results


@router.get("/{asset_id}")
def get_asset_file(asset_id: str):
    logger.info("READ asset requested: id=%s", asset_id)
    doc = assets_collection.find_one({"_id": _get_object_id(asset_id)})
    if not doc:
        logger.warning("READ asset failed, not found: id=%s", asset_id)
        raise HTTPException(status_code=404, detail="Asset not found")
    path = STORAGE_DIR / doc["category"] / doc["storedName"]
    if not path.exists():
        logger.error("READ asset failed, file missing on disk: id=%s path=%s", asset_id, path)
        raise HTTPException(status_code=404, detail="Asset file missing on disk")
    return FileResponse(path, media_type=doc["contentType"], filename=doc["originalFilename"])


@router.delete("/{asset_id}")
def delete_asset(asset_id: str):
    logger.info("DELETE asset requested: id=%s", asset_id)
    doc = assets_collection.find_one_and_delete({"_id": _get_object_id(asset_id)})
    if not doc:
        logger.warning("DELETE asset failed, not found: id=%s", asset_id)
        raise HTTPException(status_code=404, detail="Asset not found")
    (STORAGE_DIR / doc["category"] / doc["storedName"]).unlink(missing_ok=True)
    logger.info("DELETE asset succeeded: id=%s", asset_id)
    return {"status": "deleted"}
