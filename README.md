# PneumoAI

**Track:** AI+Health

**Team:** Shyaam Perumal — GEMS United Indian School, UAE (Solo Project)

## The problem

Pneumonia is a respiratory condition that can be identified through medical assessment, including chest X-ray examination. Understanding how machine learning can classify medical images is an important application of AI in healthcare.

PneumoAI explores this application through an educational chest X-ray classification prototype.

## What we built

PneumoAI is an educational chest X-ray classification application.

Users can create an account, log in, upload a chest X-ray image, and submit it for analysis. The application sends the image to a Python FastAPI backend, which loads a trained Keras model and returns a classification label and an experimental sigmoid score.

The React frontend also includes account management and profile settings, supported by Supabase authentication and profile storage.

**Important:** PneumoAI is an educational prototype, not a medical diagnostic tool. Its output is not clinically validated and must not be used to make healthcare decisions.

## What we added

**Our own idea.**

We built a complete application around the trained image-classification model rather than presenting the model as a standalone notebook. This includes:

- A React/Vite frontend with image upload and results screens.
- A FastAPI backend that connects the frontend to the saved Keras model.
- Supabase authentication, persistent sessions, and user profile management.
- An end-to-end image upload and inference workflow.

## How it works

### Dataset

We used **PneumoniaMNIST**, from the MedMNIST collection, for model training and evaluation.

- Dataset: PneumoniaMNIST
- Dataset source: MedMNIST
- Number of training examples: **4,708**
- Number of validation examples: **524**
- Number of test examples: **624**
- Data preparation: Images are processed as RGB arrays with dimensions of 224 × 224 × 3, converted to float32, and passed through MobileNetV2 `preprocess_input`.

### Model

The project uses a saved `.keras` image-classification model.

The training notebook confirms the following:

- The model uses a single sigmoid output.
- Class 0 represents Normal.
- Class 1 represents Pneumonia.
- The selected classification threshold is 0.6, which has not been independently validated.
- Images are processed as RGB arrays with dimensions of 224 × 224 × 3.
- MobileNetV2 `preprocess_input` is used for model preprocessing.

The existing model is loaded by the FastAPI backend to perform inference on uploaded images.

Model development and training were carried out using Google Colab.

## Results

The model was evaluated on a held-out test dataset containing **624 images**.

**Test accuracy: 88%**

### Classification metrics

| Metric | Normal | Pneumonia |
|---|---:|---:|
| Precision | 0.96 | 0.85 |
| Recall | 0.70 | 0.98 |
| F1-score | 0.81 | 0.91 |

**Overall metrics:**

- Macro F1-score: 0.86
- Weighted F1-score: 0.87

### Confusion matrix

```text
[[164  70]
 [  6 384]]
```

The model achieved high recall for Pneumonia (98%), but lower recall for Normal images (70%). This indicates that its performance differs between the two classes.

### Limitations and failure cases

- 70 Normal images were incorrectly classified as Pneumonia.
- 6 Pneumonia images were incorrectly classified as Normal.
- The classification threshold of 0.6 has not been independently validated.
- The model has not undergone clinical validation.
- Its output must not be used for medical diagnosis or healthcare decisions.

These results demonstrate an educational machine-learning prototype, not a clinically reliable diagnostic system.

## What we'd do next

1. Evaluate the model more thoroughly using additional performance metrics and appropriately sourced datasets.
2. Improve the application through further testing, usability improvements, and model evaluation.

## Sources and credits

- **Dataset:** [PneumoniaMNIST — MedMNIST](https://medmnist.com/)
- **Dataset paper:** Yang et al., *MedMNIST v2: A large-scale lightweight benchmark for 2D and 3D biomedical image classification*, Scientific Data, 2023.
- **Original source dataset:** Kermany et al., *Identifying Medical Diagnoses and Treatable Diseases by Image-Based Deep Learning*, Cell, 2018.
- **Model framework:** [TensorFlow / Keras](https://www.tensorflow.org/)
- **Preprocessing:** [MobileNetV2 documentation](https://www.tensorflow.org/api_docs/python/tf/keras/applications/MobileNetV2)
- **Notebook environment:** [Google Colab](https://colab.research.google.com/)
- **Frontend design:** Figma.
- **AI-assisted development:** ChatGPT and OpenAI Codex.

The dataset is intended for research and educational purposes, not clinical use.

---

# Technical documentation

## Requirements

- Windows with PowerShell
- Node.js and npm
- Python 3.11 or 3.12
- The existing model file at `model/pneumonia_classifier (1).keras`
- A Supabase project for frontend authentication and profiles


## Configure backend

Before starting the backend, create its local environment configuration file.

From the project root in PowerShell, run:

```powershell
Copy-Item backend/.env.example backend/.env
```

This copies the example preprocessing settings into the backend's local configuration. The supplied values are suitable for the documented preprocessing pipeline; no private credentials are required for backend inference.

The `backend/.env` file is intentionally excluded from GitHub. Do not upload private environment files.

## Configure Supabase

Supabase is optional for guest users who only want to test the chest X-ray upload and prediction workflow. The frontend and backend can run without Supabase credentials for this purpose.

Supabase configuration is required for signup, login, persistent user sessions, password recovery, and account/profile management. To enable these features, configure your own Supabase project using the migration in `supabase/migrations/` and the environment variables described below.


Create `frontend/.env.local` with the Supabase project URL and publishable key, using the variable names `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

Obtain both from your Supabase project's API settings. Use only the publishable key in the browser; never put a secret or service-role key in frontend configuration.

Before first signup, apply [`supabase/migrations/20261115000100_create_profiles.sql`](supabase/migrations/20261115000100_create_profiles.sql) in the Supabase Dashboard's SQL Editor.

Configure the Supabase Auth redirect URL allowlist for the local origin printed by Vite.

The frontend supports signup, login, logout, session restoration, password recovery and updates, and profile/account settings.

## Run the application

Open two PowerShell terminals at the project root.

**Terminal 1 — Backend**

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — Frontend**


**Prerequisite:** Install Node.js 20.19+ or 22.12+ before running the frontend. Verify your installation with `node --version`.


```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite.

The Vite `/api` proxy forwards requests to the FastAPI service on `127.0.0.1:8000`.

The image picker previews an image locally. Selecting Analyse uploads it to `/api/predict`, and the results screen displays the backend's label and raw sigmoid score.

The backend accepts JPEG and PNG files up to 12 MiB and center-crops/resizes images to the model's input dimensions.

Check backend/model/preprocessing readiness at `/api/health`.

More backend details are in [backend/README.md](backend/README.md), and frontend/Supabase details are in [frontend/README.md](frontend/README.md).

## Model output and preprocessing status

The supplied model returns one sigmoid score. The training notebook confirms class `0 = Normal`, class `1 = Pneumonia`, and a selected threshold of `0.6`; the application marks this threshold **unvalidated**.

The training notebook confirms RGB conversion, 224 × 224 × 3 input, float32 image arrays, and MobileNetV2 `preprocess_input`.

MedMNIST documentation describes center-square cropping followed by resizing for PneumoniaMNIST 224. The exact archive-generation interpolation is not available in the project; backend Pillow bilinear interpolation is an explicit assumption, not a notebook-confirmed setting.

See [backend/README.md](backend/README.md) for details.

## Backend checks

After installing backend dependencies, run from the project root:

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
```

The backend test suite includes a saved-model upload-to-inference workflow.

Model output remains experimental and educational only.