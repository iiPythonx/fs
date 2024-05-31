# Copyright (c) 2024 iiPython

# Modules
import re
from time import time
from pathlib import Path

from fastapi import FastAPI, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .schedule import lifespan
from .handlers import redis, upload_location
from .handlers.uploading import uploads

# FastAPI setup
app = FastAPI(lifespan = lifespan)
size_limit, megabyte = 5000 * (1024 ** 2), 1024 ** 2

encryption_regex = re.compile(r"((?:\d{1,3},){11}\d{1,3})\.((?:\d{1,3},){15}\d{1,3})")

# Handle uploading
@app.post("/api/upload/start")
async def start_upload(filename: str, header: str = None) -> JSONResponse:
    iv, salt = None, None
    if header is not None:
        results = re.findall(encryption_regex, header)
        if not results:
            return JSONResponse({"code": 400, "message": "Invalid encryption header."}, status_code = 400)
        
        iv, salt = results[0]

    return JSONResponse({"code": 200, "id": uploads.register_active_upload(filename, iv, salt)})

@app.post("/api/upload/{file_id}")
async def handle_upload_chunk(file: UploadFile, file_id: str) -> JSONResponse:
    filename = redis.hget(f"file:{file_id}", "file")
    if filename is None:
        return JSONResponse({"code": 403}, status_code = 403)

    destination = upload_location / file_id / filename
    existing_size = (destination.is_file() and destination.stat().st_size) or 0
    if existing_size > size_limit:
        uploads.delete_file(file_id)
        return JSONResponse({"code": 400, "message": "File exceeds the 5 GB size limit."}, status_code = 400)

    # Check filesize
    file.file.seek(0, 2)
    chunk_size = file.file.tell()
    if chunk_size / megabyte > 100:
        uploads.delete_file(file_id)
        return JSONResponse({"code": 400, "message": "Chunk exceeds the 100 MB size limit."}, status_code = 400)

    elif existing_size + chunk_size >= size_limit:
        uploads.delete_file(file_id)
        return JSONResponse({"code": 400, "message": "File exceeds the 5 GB size limit."}, status_code = 400)

    # Handle writing
    uploads.active_uploads[file_id] = time()
    with destination.open("ab") as fh:
        file.file.seek(0, 0)
        fh.write(await file.read())

    return JSONResponse({"code": 200})

@app.post("/api/upload/{file_id}/finalize")
async def handle_upload_finalize(request: Request, file_id: str) -> JSONResponse:
    filename = redis.hget(f"file:{file_id}", "file")
    if filename is None:
        return JSONResponse({"code": 403}, status_code = 403)

    if file_id not in uploads.active_uploads:
        uploads.delete_file(file_id)
        return JSONResponse({"code": 400, "message": "File ID is no longer valid."}, status_code = 400)

    del uploads.active_uploads[file_id]

    # Set access data
    return JSONResponse({"code": 200, "file": f"{file_id}/{filename}", "token": uploads.generate_access_token(file_id)})

@app.get("/api/find/{file_id}")
async def handle_find(file_id: str) -> JSONResponse:
    file_data = redis.hgetall(f"file:{file_id}")
    if not file_data:
        return JSONResponse({"code": 404}, status_code = 404)

    return JSONResponse({
        "code": 200,
        "size": (upload_location / file_id / file_data["file"]).stat().st_size,
        **file_data
    })

@app.delete("/api/delete/{access_token}")
async def handle_delete(access_token: str) -> JSONResponse:
    file_id = redis.get(f"access:{access_token}")
    if file_id is None:
        return JSONResponse({"code": 403}, status_code = 403)

    uploads.delete_file(file_id)
    redis.delete(f"access:{access_token}")
    return JSONResponse({"code": 200, "id": file_id})

# Frontend (CORS bypass)
frontend = Path(__file__).parent / "frontend"

@app.get("/")
async def index() -> FileResponse:
    return FileResponse(frontend / "terminal.html")

app.mount("/d", StaticFiles(directory = upload_location))
app.mount("/", StaticFiles(directory = frontend))
