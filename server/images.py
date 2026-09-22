import uuid
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from db import STORAGE_DIR, images_collection

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
    if not (file.content_type or "").startswith("image/"):
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
    return _serialize(doc)


@router.get("")
def list_images():
    return [_serialize(doc) for doc in images_collection.find().sort("createdAt", -1)]


@router.get("/{image_id}")
def get_image_file(image_id: str):
    doc = images_collection.find_one({"_id": _get_object_id(image_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")
    path = STORAGE_DIR / doc["storedName"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image file missing on disk")
    return FileResponse(path, media_type=doc["contentType"])


@router.delete("/{image_id}")
def delete_image(image_id: str):
    doc = images_collection.find_one_and_delete({"_id": _get_object_id(image_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Image not found")
    (STORAGE_DIR / doc["storedName"]).unlink(missing_ok=True)
    return {"status": "deleted"}
