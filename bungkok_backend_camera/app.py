from __future__ import annotations

import asyncio
import os
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from api_data import data_router
from auth import current_user
from database import SessionLocal, init_db
from model.posture_backend_v3 import PostureBackendV3
from models_db import ExerciseSession
from session_service import record_prediction

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
MODEL_DIR = BASE_DIR / "model"
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "5")) * 1024 * 1024
CALIBRATION_TTL_SECONDS = int(os.getenv("CALIBRATION_TTL_MINUTES", "60")) * 60
ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


async def read_image(upload: UploadFile) -> tuple[bytes, str]:
    suffix = ALLOWED_IMAGE_TYPES.get(upload.content_type or "")
    if suffix is None:
        raise HTTPException(415, "Format gambar harus JPEG, PNG, atau WebP")
    content = await upload.read(MAX_UPLOAD_BYTES + 1)
    await upload.close()
    if not content:
        raise HTTPException(400, "File gambar kosong")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Ukuran gambar maksimal {MAX_UPLOAD_BYTES // 1024 // 1024} MB")
    return content, suffix


def create_app(backend_override: Any | None = None) -> FastAPI:
    calibrations: dict[str, dict[str, Any]] = {}
    model_lock = asyncio.Lock()

    def prune_calibrations():
        now = time.monotonic()
        for calibration_id in [
            key for key, value in calibrations.items()
            if now - value["created_at"] > CALIBRATION_TTL_SECONDS
        ]:
            calibrations.pop(calibration_id, None)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db()
        owns_backend = backend_override is None
        app.state.db = SessionLocal
        app.state.backend = backend_override or PostureBackendV3(
            MODEL_DIR / "pose_landmarker_lite.task",
            MODEL_DIR / "posture_backend_v3_config.json",
        )
        try:
            yield
        finally:
            calibrations.clear()
            if owns_backend:
                app.state.backend.close()

    app = FastAPI(
        title="BUNGKOK API",
        version="2.0.0",
        description="API postur dengan Supabase Auth dan progres server-authoritative.",
        lifespan=lifespan,
    )
    origins = [value.strip() for value in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
    ).split(",") if value.strip()]
    app.add_middleware(
        CORSMiddleware, allow_origins=origins, allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"],
    )

    @app.get("/", include_in_schema=False)
    async def camera_tester():
        return RedirectResponse(os.getenv("FRONTEND_APP_URL", "http://localhost:5173/app/dashboard"))

    @app.get("/api/health")
    async def health():
        prune_calibrations()
        return {"status": "ok", "model": app.state.backend.config.get("model_name", "BUNGKOK"),
                "active_calibrations": len(calibrations)}

    async def process_image(content, suffix, method, *args):
        with tempfile.TemporaryDirectory(prefix="bungkok_frame_") as temp_dir:
            path = Path(temp_dir) / f"frame{suffix}"
            path.write_bytes(content)
            try:
                async with model_lock:
                    return await run_in_threadpool(method, path, *args)
            except ValueError as error:
                raise HTTPException(422, str(error)) from error
            except Exception as error:
                raise HTTPException(422, "Gambar tidak dapat diproses") from error

    # Endpoint deteksi real-time untuk kalibrasi dan alignment postur kamera
    # Dibuat publik/ringan tanpa auth ketat agar loop frame 200ms tidak terhambat expired JWT
    @app.post("/api/detect")
    async def detect_pose(image: UploadFile = File(...), camera_mode: str = Form("auto")):
        content, suffix = await read_image(image)
        method = getattr(app.state.backend, "detect", app.state.backend.extract)
        return await process_image(content, suffix, method, camera_mode)

    @app.post("/api/calibrations")
    async def create_calibration(images: list[UploadFile] = File(...), camera_mode: str = Form("auto"),
                                 user=Depends(current_user)):
        minimum = int(app.state.backend.config["calibration"]["minimum_images"])
        if not minimum <= len(images) <= 10:
            raise HTTPException(422, f"Kirim {minimum} sampai 10 foto tegak")
        uploads = [await read_image(image) for image in images]
        with tempfile.TemporaryDirectory(prefix="bungkok_calibration_") as temp_dir:
            paths = []
            for index, (content, suffix) in enumerate(uploads):
                path = Path(temp_dir) / f"upright_{index}{suffix}"
                path.write_bytes(content)
                paths.append(path)
            try:
                async with model_lock:
                    calibration = await run_in_threadpool(
                        app.state.backend.calibrate, paths, camera_mode=camera_mode
                    )
            except (ValueError, TypeError) as error:
                raise HTTPException(422, str(error)) from error
        prune_calibrations()
        calibration_id = str(uuid.uuid4())
        calibrations[calibration_id] = {
            "calibration": calibration, "created_at": time.monotonic(), "user_id": user["id"]
        }
        return {"status": "ok", "calibration_id": calibration_id,
                "valid_samples": calibration["valid_samples"],
                "rejected_samples": calibration["rejected_samples"],
                "expires_in_seconds": CALIBRATION_TTL_SECONDS}

    @app.post("/api/predict")
    async def predict(calibration_id: str = Form(...), session_id: str | None = Form(None),
                      image: UploadFile = File(...), user=Depends(current_user)):
        prune_calibrations()
        calibration = calibrations.get(calibration_id)
        if not calibration or calibration["user_id"] != user["id"]:
            raise HTTPException(404, "Kalibrasi tidak ditemukan atau sudah kedaluwarsa")
        content, suffix = await read_image(image)
        result = await process_image(content, suffix, app.state.backend.predict, calibration["calibration"])
        if session_id:
            with SessionLocal() as db:
                row = db.scalar(select(ExerciseSession).where(
                    ExerciseSession.id == session_id, ExerciseSession.user_id == user["id"]
                ).with_for_update())
                if not row:
                    raise HTTPException(404, "Sesi latihan tidak ditemukan")
                server_result = record_prediction(db, row, result)
                db.commit()
                result["server"] = server_result
        return result

    @app.delete("/api/calibrations/{calibration_id}")
    async def delete_calibration(calibration_id: str, user=Depends(current_user)):
        value = calibrations.get(calibration_id)
        if value and value["user_id"] == user["id"]:
            calibrations.pop(calibration_id, None)
        return {"status": "deleted"}

    app.include_router(data_router(app, calibrations))
    return app


app = create_app()
