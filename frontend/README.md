# PneumoAI frontend

React application built with Vite. It uses Supabase Auth for account access and profile management, and the FastAPI backend for image classification with the existing saved `.keras` model.

**Educational use only:** PneumoAI is not a medical diagnostic tool. Experimental output must not be used to make healthcare decisions.

## Configure Supabase

Create `frontend/.env.local` with these variable names and your own project settings:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Get the project URL and publishable key from your Supabase project's API settings. Do not use a secret or service-role key in the frontend; browser environment variables are bundled into client-side code. `*.local` files are ignored by the frontend Git ignore rules.

Apply [`supabase/migrations/20261115000100_create_profiles.sql`](../supabase/migrations/20261115000100_create_profiles.sql) in the Supabase Dashboard's SQL Editor before creating accounts. The migration creates the profile table, user-specific Row Level Security policies, and the signup profile trigger. Configure the Supabase Auth URL allowlist for the local origin shown by Vite so email confirmation and password recovery can return to the app.

## Run on Windows

In PowerShell:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. Start the FastAPI backend separately by following [`backend/README.md`](../backend/README.md). Vite proxies `/api` to the local backend.

## Authentication and profile features

The frontend supports Supabase signup, login, logout, persistent sessions and session restoration after refresh, password recovery, and profile data. Signup requires display name and age. The account settings popup allows editing display name and age, displays email as read-only, and can update the password through the signed-in Supabase Auth session. Profile changes update the existing user's row in `public.profiles`.

## Image analysis

The upload screen previews a selected image in the browser. Analyse sends the image to the FastAPI `POST /api/predict` endpoint and shows loading, error, classification label and raw sigmoid score states. The backend must be running and its saved model and preprocessing configuration must be available. The backend accepts JPEG and PNG files up to 12 MiB and handles resizing; users do not need to provide a 224 × 224 image.

The training notebook confirms class `0 = Normal`, class `1 = Pneumonia`, and a selected threshold of `0.6`. The application marks the threshold unvalidated, and all model results are experimental and non-diagnostic. The backend documentation distinguishes confirmed preprocessing from the assumed Pillow bilinear interpolation method.
