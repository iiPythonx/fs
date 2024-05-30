# Copyright (c) 2024 iiPython

# Modules
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .operations import delete_file, cleaner

# Handle scheduling
def clean_in_progress_uploads() -> None:
    for file_id, last_time in cleaner.uploads.copy().items():
        if time.time() - last_time <= 10:
            continue

        delete_file(file_id)

@asynccontextmanager
async def lifespan(app: FastAPI) -> None:
    sched = AsyncIOScheduler()
    sched.add_job(clean_in_progress_uploads, trigger = "interval", minutes = 1)
    sched.start()
    yield
