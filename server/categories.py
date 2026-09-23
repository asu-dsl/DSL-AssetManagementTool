CATEGORY_EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"},
    "model": {".obj", ".gltf", ".glb", ".fbx", ".dae", ".stl"},
    "video": {".mp4", ".mov", ".avi", ".mkv"},
    "audio": {".mp3", ".wav", ".ogg"},
    "document": {".pdf", ".txt", ".doc", ".docx"},
}

EXTENSION_TO_CATEGORY = {
    ext: category for category, extensions in CATEGORY_EXTENSIONS.items() for ext in extensions
}
