import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pymongo.errors import ServerSelectionTimeoutError

from assets import router as assets_router
from db import assets_collection

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="DSL Asset Management API")
app.include_router(assets_router)
app.mount("/ui", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="ui")


@app.get("/health")
def health():
    try:
        assets_collection.database.client.admin.command("ping")
    except ServerSelectionTimeoutError:
        raise HTTPException(status_code=503, detail="MongoDB unreachable")
    return {"status": "ok"}
