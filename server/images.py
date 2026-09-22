import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from db import STORAGE_DIR, images_collection

logger = logging.getLogger("ams.images")
router = APIRouter(prefix="/images", tags=["images"])


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


def _get_object_id(image_id: str) -> ObjectId:
    try:
        return ObjectId(image_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid image id")


@router.post("")
async def upload_image(
    file: UploadFile = File(...),
    title: str = Form(""),
    author: str = Form(""),
    tags: str = Form(""),
    version: str = Form(""),
    notes: str = Form(""),
):
    logger.info("CREATE image requested: filename=%s contentType=%s", file.filename, file.content_type)

    if not (file.content_type or "").startswith("image/"):
        logger.warning("CREATE image rejected: filename=%s contentType=%s", file.filename, file.content_type)
        raise HTTPException(status_code=400, detail="File must be an image")

    contents = await file.read()
    stored_name = f"{uuid.uuid4().hex}{Path(file.filename or '').suffix}"
    (STORAGE_DIR / stored_name).write_bytes(contents)

    now = datetime.now(timezone.utc)
    doc = {
        "storedName": stored_name,
        "originalFilename": file.filename,
        "contentType": file.content_type,
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
    doc["_id"] = images_collection.insert_one(doc).inserted_id
    logger.info("CREATE image succeeded: id=%s storedName=%s size=%d", doc["_id"], stored_name, doc["size"])
    return _serialize(doc)


@router.get("")
def list_images():
    logger.info("LIST images requested")
    results = [_serialize(doc) for doc in images_collection.find().sort("createdAt", -1)]
    logger.info("LIST images returned %d result(s)", len(results))
    return results


@router.get("/{image_id}")
def get_image_file(image_id: str):
    logger.info("READ image requested: id=%s", image_id)
    doc = images_collection.find_one({"_id": _get_object_id(image_id)})
    if not doc:
        logger.warning("READ image failed, not found: id=%s", image_id)
        raise HTTPException(status_code=404, detail="Image not found")
    path = STORAGE_DIR / doc["storedName"]
    if not path.exists():
        logger.error("READ image failed, file missing on disk: id=%s storedName=%s", image_id, doc["storedName"])
        raise HTTPException(status_code=404, detail="Image file missing on disk")
    return FileResponse(path, media_type=doc["contentType"])


@router.delete("/{image_id}")
def delete_image(image_id: str):
    logger.info("DELETE image requested: id=%s", image_id)
    doc = images_collection.find_one_and_delete({"_id": _get_object_id(image_id)})
    if not doc:
        logger.warning("DELETE image failed, not found: id=%s", image_id)
        raise HTTPException(status_code=404, detail="Image not found")
    (STORAGE_DIR / doc["storedName"]).unlink(missing_ok=True)
    logger.info("DELETE image succeeded: id=%s storedName=%s", image_id, doc["storedName"])
    return {"status": "deleted"}
