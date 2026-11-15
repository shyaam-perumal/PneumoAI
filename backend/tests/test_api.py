import asyncio
from io import BytesIO

import numpy as np
from httpx2 import ASGITransport, AsyncClient
from PIL import Image
import pytest

from app.main import app
from app.inference import model_runtime
from app.decision import interpret_score


class StubModel:
    input_shape = (None, 224, 224, 3)

    def __init__(self):
        self.tensor = None

    def predict(self, tensor, verbose=0):
        self.tensor = tensor
        return np.array([[0.731]])


def png_bytes(color=(120, 80, 40), size=(224, 224)):
    image = Image.new("RGB", size, color)
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def configure_test_preprocessing(monkeypatch):
    settings = {
        "PNEUMOAI_CHANNEL_CONVERSION": "rgb",
        "PNEUMOAI_COLOR_ORDER": "rgb",
        "PNEUMOAI_RESIZE_MODE": "center_crop_resize",
        "PNEUMOAI_RESIZE_INTERPOLATION": "bilinear",
        "PNEUMOAI_NORMALIZATION": "mobilenet_v2",
    }
    for name, value in settings.items():
        monkeypatch.setenv(name, value)


def post_upload(filename, image_bytes):
    async def send_request():
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.post(
                "/api/predict",
                files={"file": (filename, image_bytes, "image/png")},
            )

    return asyncio.run(send_request())


def test_upload_reaches_model_and_returns_experimental_label(monkeypatch):
    configure_test_preprocessing(monkeypatch)
    stub = StubModel()
    monkeypatch.setattr(model_runtime, "_model", stub)

    response = post_upload("sample-xray.png", png_bytes())

    assert response.status_code == 200
    body = response.json()
    assert body["raw_sigmoid_score"] == 0.731
    assert body["class_label"] == "Pneumonia"
    assert body["class_mapping_status"] == "confirmed_from_training_notebook"
    assert body["threshold"] == 0.6
    assert body["threshold_status"] == "unvalidated"
    assert body["preprocessing_status"] == "matches_documented_crop_resize_with_bilinear_assumption"
    assert stub.tensor.shape == (1, 224, 224, 3)
    assert np.allclose(stub.tensor[0, 0, 0], np.array([120, 80, 40], dtype=np.float32) / 127.5 - 1)


def test_upload_is_blocked_when_preprocessing_is_not_configured(monkeypatch):
    for name in (
        "PNEUMOAI_CHANNEL_CONVERSION",
        "PNEUMOAI_COLOR_ORDER",
        "PNEUMOAI_RESIZE_MODE",
        "PNEUMOAI_RESIZE_INTERPOLATION",
        "PNEUMOAI_NORMALIZATION",
    ):
        monkeypatch.delenv(name, raising=False)

    response = post_upload("sample-xray.png", png_bytes())

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "preprocessing_not_configured"
    assert "PNEUMOAI_NORMALIZATION" in response.json()["detail"]["missing_settings"]


def test_notebook_class_mapping_and_selected_threshold():
    assert interpret_score(0.5999) == "Normal"
    assert interpret_score(0.6) == "Pneumonia"


def test_real_model_upload_to_inference_workflow():
    model_runtime._model = None
    response = post_upload("real-model-smoke.png", png_bytes(size=(224, 224)))

    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body["raw_sigmoid_score"], (int, float))
    assert 0 <= body["raw_sigmoid_score"] <= 1
    assert body["class_label"] in {"Normal", "Pneumonia"}
    assert model_runtime.is_loaded
    assert tuple(model_runtime.input_shape_if_loaded) == (None, 224, 224, 3)
