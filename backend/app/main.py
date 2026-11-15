"""PneumoAI experimental image inference API."""

from __future__ import annotations

from fastapi.concurrency import run_in_threadpool
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .inference import MODEL_PATH, ModelInferenceError, model_runtime
from .decision import CLASS_MAPPING, PNEUMONIA_THRESHOLD, interpret_score
from .preprocessing import PreprocessingConfig, PreprocessingNotConfigured, config_status

MAX_UPLOAD_BYTES = 12 * 1024 * 1024

app = FastAPI(
    title="PneumoAI Experimental API",
    description=(
        "Educational image-classification prototype. It is not a medical diagnostic tool. "
        "Notebook preprocessing and class labels are configured; model predictions remain experimental."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    prep = config_status()
    model_exists = MODEL_PATH.is_file()
    if not model_exists:
        status = "model_file_missing"
    elif not prep["configured"]:
        status = "preprocessing_required"
    elif not model_runtime.is_loaded:
        status = "model_ready_to_load"
    else:
        status = "ready"
    return {
        "status": status,
        "model": {
            "file": MODEL_PATH.name,
            "file_exists": model_exists,
            "loaded": model_runtime.is_loaded,
            "input_shape": model_runtime.input_shape_if_loaded,
            "output_interpretation": "single sigmoid score; 0=Normal, 1=Pneumonia",
        },
        "preprocessing": prep,
        "class_mapping": {"verified_from_notebook": True, "labels": CLASS_MAPPING},
        "threshold": {"value": PNEUMONIA_THRESHOLD, "status": "unvalidated"},
        "educational_use_only": True,
    }


@app.post("/api/predict")
async def predict(file: UploadFile = File(...)) -> dict:
    try:
        preprocessing = PreprocessingConfig.from_env()
    except PreprocessingNotConfigured as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "preprocessing_not_configured",
                "message": "Inference is disabled until the training-time preprocessing is confirmed.",
                "missing_settings": exc.missing,
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=503, detail={"code": "invalid_preprocessing_config", "message": str(exc)}) from exc

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail={"code": "file_too_large", "message": "Maximum image size is 12 MB."})
    if not data:
        raise HTTPException(status_code=400, detail={"code": "empty_file", "message": "The uploaded image is empty."})

    try:
        score = await run_in_threadpool(model_runtime.raw_score, data, preprocessing)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "invalid_image", "message": str(exc)}) from exc
    except ModelInferenceError as exc:
        raise HTTPException(status_code=503, detail={"code": "model_unavailable", "message": str(exc)}) from exc
    finally:
        await file.close()

    return {
        "filename": file.filename,
        "raw_sigmoid_score": score,
        "class_label": interpret_score(score),
        "class_mapping_status": "confirmed_from_training_notebook",
        "threshold": PNEUMONIA_THRESHOLD,
        "threshold_status": "unvalidated",
        "preprocessing_status": "matches_documented_crop_resize_with_bilinear_assumption",
        "result_status": "experimental",
        "warning": "Educational use only. Not a medical diagnosis or a basis for healthcare decisions.",
    }
