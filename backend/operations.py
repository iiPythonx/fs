# Copyright (c) 2024 iiPython

# Modules
import json
import shutil
import string
from pathlib import Path

from redis import Redis

# Initialization
config = json.loads((Path(__file__).parents[1] / "config.json").read_text())
redis = Redis(
    host = config["redis_host"],
    password = config["redis_pswd"],
    decode_responses = True
)

# Handle path locations
upload_location = Path(config["upload_dir"])
upload_location.mkdir(exist_ok = True)
allowed_characters = string.ascii_letters + string.digits + "_.-"

# Handle uploading class
class UploadCleaner():
    def __init__(self) -> None:
        self.uploads = {}

cleaner = UploadCleaner()

# Helping methods
def normalize(filename: str) -> str:
    return "".join([c for c in " ".join(filename.split()).replace(" ", "_") if c in allowed_characters])

def delete_file(file_id: str) -> None:
    if file_id in cleaner.uploads:
        del cleaner.uploads[file_id]

    redis.delete(f"file:{file_id}")
    shutil.rmtree(upload_location / file_id)
