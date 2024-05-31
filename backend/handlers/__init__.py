# Copyright (c) 2024 iiPython

# Modules
import json
from pathlib import Path

from redis import Redis

# Initialization
config = json.loads((Path.cwd() / "config.json").read_text())
redis = Redis(**config["redis"], decode_responses = True)

# Handle path locations
upload_location = Path(config.get("uploads", "uploads"))
upload_location.mkdir(exist_ok = True)
