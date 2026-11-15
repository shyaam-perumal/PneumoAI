from io import BytesIO

import numpy as np
import pytest
from PIL import Image

from app.preprocessing import PreprocessingConfig, preprocess_image


def image_bytes(size: tuple[int, int], *, axis: str) -> bytes:
    width, height = size
    pixels = np.zeros((height, width, 3), dtype=np.uint8)
    if axis == "x":
        pixels[:, : width // 4] = (255, 0, 0)
        pixels[:, width // 4 : 3 * width // 4] = (0, 255, 0)
        pixels[:, 3 * width // 4 :] = (0, 0, 255)
    elif axis == "y":
        pixels[: height // 4, :] = (255, 0, 0)
        pixels[height // 4 : 3 * height // 4, :] = (0, 255, 0)
        pixels[3 * height // 4 :, :] = (0, 0, 255)
    else:
        pixels[:, :] = (0, 255, 0)

    output = BytesIO()
    Image.fromarray(pixels, mode="RGB").save(output, format="PNG")
    return output.getvalue()


@pytest.fixture
def config() -> PreprocessingConfig:
    return PreprocessingConfig(
        channel_conversion="rgb",
        color_order="rgb",
        resize_mode="center_crop_resize",
        interpolation="bilinear",
        normalization="mobilenet_v2",
    )


@pytest.mark.parametrize(
    ("size", "axis"),
    [((400, 200), "x"), ((200, 400), "y"), ((300, 300), "square")],
    ids=["landscape", "portrait", "already-square"],
)
def test_crop_resize_outputs_model_tensor_for_common_aspect_ratios(config, size, axis):
    tensor = preprocess_image(image_bytes(size, axis=axis), (224, 224), config)

    assert tensor.shape == (1, 224, 224, 3)
    assert tensor.dtype == np.float32
    assert np.allclose(tensor[0, 112, 112], np.array([0, 255, 0], dtype=np.float32) / 127.5 - 1)
