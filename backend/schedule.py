# Copyright (c) 2024 iiPython

# Modules
from contextlib import asynccontextmanager

from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .handlers.uploading import uploads

# Handle scheduling
@asynccontextmanager
async def lifespan(app: FastAPI) -> None:
    sched = AsyncIOScheduler()
    sched.add_job(uploads.clean_in_progress_uploads, trigger = "interval", minutes = 1)
    sched.start()
    yield
