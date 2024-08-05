# Copyright (c) 2024 iiPython

# Modules
import shutil
import string
from time import time

from nanoid import generate

from . import redis, upload_location

# Helping methods
allowed_characters = string.ascii_letters + string.digits + "_.-"
def normalize(filename: str) -> str:
    return "".join([c for c in " ".join(filename.split()).replace(" ", "_") if c in allowed_characters])

# Main uploading class
class UploadHandler():
    def __init__(self) -> None:
        self.active_uploads = {}

    def delete_file(self, file_id: str) -> None:
        if file_id in self.active_uploads:
            del self.active_uploads[file_id]

        redis.delete(f"file:{file_id}")
        shutil.rmtree(upload_location / file_id)

    def generate_access_token(self, file_id: str) -> str:
        access_token = generate(size = 10)
        redis.set(f"access:{access_token}", file_id)
        return access_token

    def register_active_upload(self, filename: str, iv: str | None = None, salt: str | None = None) -> str:
        encryption_data = {"iv": iv, "salt": salt} if iv is not None else {}

        # Handle path creation
        path = upload_location
        while path.is_dir():
            path = upload_location / generate(size = 10)

        path.mkdir()

        # Handle database entries
        self.active_uploads[path.name] = time()
        redis.hset(f"file:{path.name}", mapping = {"file": normalize(filename)} | encryption_data)
        return path.name

    def clean_in_progress_uploads(self) -> None:
        for file_id, last_time in self.active_uploads.copy().items():
            if time() - last_time <= 10:
                continue

            self.delete_file(file_id)

uploads = UploadHandler()
