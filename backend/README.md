# PneumoAI backend

FastAPI service for the existing `model/pneumonia_classifier (1).keras` model. Uploaded files are decoded in memory and are not saved.

**Educational use only:** model output is experimental, is not a medical diagnosis, and must not be used to make healthcare decisions.

## Install and run on Windows

Run these commands in PowerShell from the project root:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

The service reads preprocessing settings from `backend/.env`. The file should remain local and must not be committed if it contains private configuration. The frontend's Vite development proxy sends `/api` requests to this service.

## Preprocessing: confirmed details and assumption

The original notebook, [`training reference/Veritas_AI_Pneumonia_Model - Copy.ipynb`](../training%20reference/Veritas_AI_Pneumonia_Model%20-%20Copy.ipynb), confirms that the model uses 224 × 224 × 3 input, converts images to RGB with PIL, converts them to NumPy float32, and calls TensorFlow MobileNetV2 `preprocess_input`. The notebook loads `PneumoniaMNIST(size=224)`.

MedMNIST's dataset documentation describes the 224-size PneumoniaMNIST preparation as center-cropping to a square using the shorter image edge and resizing to the requested dimensions. The project does not include the exact archive or its generation settings. The notebook does not identify the interpolation method. Therefore, the backend's Pillow bilinear resampling is a documented implementation assumption, **not a confirmed training setting**. If the original archive or generation recipe becomes available, compare its resize interpolation with this assumption.

For uploaded images, the backend converts to RGB, center-crops non-square images to a square, resizes to the loaded model's input size using the current bilinear assumption, converts pixels to float32, and applies MobileNetV2 preprocessing. Already-square images skip the crop; images already at target dimensions also skip resize.

## API

- `GET /api/health` reports model file/load status, preprocessing configuration and interpretation status.
- `POST /api/predict` accepts a JPEG or PNG in multipart field `file`, up to 12 MiB. It returns the raw sigmoid score, a class label, threshold status, preprocessing status, and an educational-use warning.

The training notebook confirms the single sigmoid output's mapping: class `0 = Normal`, class `1 = Pneumonia`. It also selects a threshold of `0.6`; this application marks the threshold **unvalidated**. Neither the threshold nor predictions are claims of clinical accuracy or diagnostic validity.

## Tests

From the project root in PowerShell:

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
```

The suite includes preprocessing tests and a real saved-model upload-to-inference workflow. Run after installing the listed dependencies and ensuring the saved model file is present.
