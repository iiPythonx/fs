# Copyright (c) 2024 iiPython

# Modules
import shutil
import string
from pathlib import Path

from redis import Redis

# Initialization
redis = Redis(
    host = "192.168.0.10",
    password = "d7f6925d75c16a69a7321f85e01624d6d90e022eef43babd4c60b75155a923d6",
    decode_responses = True
)

# Handle path locations
upload_location = Path("/run/media/benjamin/942ae1d6-97c6-4d22-9f80-a1ad583ed547/uploads")
# upload_location = Path(__file__).parent / "uploads"
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
