"""Image preparation following the verified PneumoAI training notebook."""

from __future__ import annotations

import os
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class PreprocessingNotConfigured(ValueError):
    def __init__(self, missing: list[str]):
        self.missing = missing
        super().__init__(f"Preprocessing configuration is incomplete: {', '.join(missing)}")


@dataclass(frozen=True)
class PreprocessingConfig:
    channel_conversion: str
    color_order: str
    resize_mode: str
    interpolation: str
    normalization: str

    @classmethod
    def from_env(cls) -> "PreprocessingConfig":
        values = {
            "PNEUMOAI_CHANNEL_CONVERSION": os.getenv("PNEUMOAI_CHANNEL_CONVERSION", "").strip().lower(),
            "PNEUMOAI_COLOR_ORDER": os.getenv("PNEUMOAI_COLOR_ORDER", "").strip().lower(),
            "PNEUMOAI_RESIZE_MODE": os.getenv("PNEUMOAI_RESIZE_MODE", "").strip().lower(),
            "PNEUMOAI_RESIZE_INTERPOLATION": os.getenv("PNEUMOAI_RESIZE_INTERPOLATION", "").strip().lower(),
            "PNEUMOAI_NORMALIZATION": os.getenv("PNEUMOAI_NORMALIZATION", "").strip().lower(),
        }
        missing = [name for name, value in values.items() if not value]
        if missing:
            raise PreprocessingNotConfigured(missing)

        allowed = {
            "PNEUMOAI_CHANNEL_CONVERSION": {"rgb", "gray_repeat", "strict_rgb"},
            "PNEUMOAI_COLOR_ORDER": {"rgb", "bgr"},
            "PNEUMOAI_RESIZE_MODE": {"center_crop_resize"},
            "PNEUMOAI_RESIZE_INTERPOLATION": {"bilinear"},
            "PNEUMOAI_NORMALIZATION": {"raw_0_255", "zero_one", "mobilenet_v2"},
        }
        invalid = [name for name, value in values.items() if value not in allowed[name]]
        if invalid:
            raise ValueError(f"Unsupported preprocessing values for: {', '.join(invalid)}")

        return cls(
            channel_conversion=values["PNEUMOAI_CHANNEL_CONVERSION"],
            color_order=values["PNEUMOAI_COLOR_ORDER"],
            resize_mode=values["PNEUMOAI_RESIZE_MODE"],
            interpolation=values["PNEUMOAI_RESIZE_INTERPOLATION"],
            normalization=values["PNEUMOAI_NORMALIZATION"],
        )


def config_status() -> dict[str, Any]:
    try:
        config = PreprocessingConfig.from_env()
    except PreprocessingNotConfigured as exc:
        return {"configured": False, "missing": exc.missing, "verification": "incomplete"}
    except ValueError as exc:
        return {"configured": False, "error": str(exc), "verification": "invalid_configuration"}
    return {
        "configured": True,
        "settings": {
            "channel_conversion": config.channel_conversion,
            "color_order": config.color_order,
            "resize_mode": config.resize_mode,
            "interpolation": config.interpolation,
            "normalization": config.normalization,
        },
        "verification": "center_crop_resize_from_medmnist_docs; bilinear_interpolation_assumed",
    }


def preprocess_image(data: bytes, target_size: tuple[int, int], config: PreprocessingConfig) -> np.ndarray:
    """Decode, resize and scale an image according to an explicit operator-selected policy.

    target_size is (height, width), taken from the loaded model input signature.
    """
    target_height, target_width = target_size

    try:
        with Image.open(BytesIO(data)) as source:
            if source.format not in {"JPEG", "PNG"}:
                raise ValueError("Only JPEG and PNG images are supported.")
            if config.channel_conversion == "strict_rgb":
                if source.mode != "RGB":
                    raise ValueError("This configuration accepts only RGB images.")
                image = source.copy()
            elif config.channel_conversion == "gray_repeat":
                gray = source.convert("L")
                image = Image.merge("RGB", (gray, gray, gray))
            else:
                image = source.convert("RGB")
    except (OSError, Image.DecompressionBombError) as exc:
        raise ValueError("The uploaded file is not a valid, supported image.") from exc

    # PneumoniaMNIST documents center-cropping the short edge before resizing.
    # Its published training notebook does not specify archive interpolation;
    # use explicit bilinear resampling as a reasonable, documented assumption.
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    if image.size != (target_width, target_height):
        image = image.resize(
            (target_width, target_height),
            resample=Image.Resampling.BILINEAR,
        )

    pixels = np.asarray(image, dtype=np.float32)
    if config.color_order == "bgr":
        pixels = pixels[..., ::-1]
    if config.normalization == "zero_one":
        pixels /= 255.0
    elif config.normalization == "mobilenet_v2":
        pixels = pixels / 127.5 - 1.0

    return np.expand_dims(pixels, axis=0)
