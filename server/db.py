import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

_client = MongoClient(os.environ["MONGO_URI"], serverSelectionTimeoutMS=5000)
db = _client[os.environ.get("MONGO_DB_NAME", "ams")]

assets_collection = db["assets"]
assets_collection.create_index("filePath", unique=True)

images_collection = db["images"]

STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", Path(__file__).parent / "storage" / "images"))
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
