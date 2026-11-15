"""Keras model loading and raw-output inference; no class labels are assigned here."""

from __future__ import annotations

import os
from pathlib import Path
from threading import Lock
from typing import Any

os.environ.setdefault("KERAS_BACKEND", "tensorflow")

import numpy as np

from .preprocessing import PreprocessingConfig, preprocess_image


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = PROJECT_ROOT / "model" / "pneumonia_classifier (1).keras"


class ModelInferenceError(RuntimeError):
    pass


class ModelRuntime:
    def __init__(self, model_path: Path = MODEL_PATH) -> None:
        self.model_path = model_path
        self._model: Any | None = None
        self._lock = Lock()

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def input_shape_if_loaded(self) -> list[int | None] | None:
        if self._model is None:
            return None
        return [int(dimension) if dimension is not None else None for dimension in self._model.input_shape]

    def load(self) -> Any:
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model
            if not self.model_path.is_file():
                raise ModelInferenceError(f"Model file not found at {self.model_path}")
            try:
                import keras

                model = keras.models.load_model(self.model_path, compile=False)
            except Exception as exc:  # Keras can raise several archive/backend-specific errors.
                raise ModelInferenceError(f"Could not load the saved Keras model: {exc}") from exc
            shape = model.input_shape
            if isinstance(shape, list):
                raise ModelInferenceError("Expected a single-input classification model.")
            if len(shape) != 4 or shape[-1] != 3 or not shape[1] or not shape[2]:
                raise ModelInferenceError(f"Unsupported model input shape: {shape}")
            self._model = model
            return model

    def input_size(self) -> tuple[int, int]:
        shape = self.load().input_shape
        return int(shape[1]), int(shape[2])

    def raw_score(self, image_bytes: bytes, config: PreprocessingConfig) -> float:
        model = self.load()
        tensor = preprocess_image(image_bytes, self.input_size(), config)
        with self._lock:
            prediction = np.asarray(model.predict(tensor, verbose=0))
        if prediction.size != 1:
            raise ModelInferenceError(f"Expected one sigmoid output, received shape {prediction.shape}.")
        score = float(prediction.reshape(-1)[0])
        if not np.isfinite(score):
            raise ModelInferenceError("Model returned a non-finite score.")
        return score


model_runtime = ModelRuntime()
