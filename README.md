# AgroAI — Intelligent Agricultural Decision Support System

AgroAI is a comprehensive, explainable AI web application designed for modern precision agriculture. It integrates graph search algorithms, constraint satisfaction solvers, genetic optimization, and machine learning prediction interfaces with real-time field telemetry and cloud database storage.

---

## Technical Stack

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS (Stitch UI Design System)
* **Backend**: FastAPI (Python 3.14), Pydantic, Uvicorn
* **Database & Auth**: GCP Cloud Firestore + Firebase Authentication (Modular SDK v12)
* **Image Processing**: OpenCV (`cv2`) image decoding, 224x224 RGB resizing & normalization
* **AI Algorithms**:
  * **CSP & AC-3**: Arc Consistency domain reduction + Backtracking Search
  * **Genetic Algorithm**: Multi-objective irrigation schedule evolution
  * **Pathfinding**: A* Search ($f(n) = g(n) + h(n)$), BFS, DFS
  * **Risk Simulation**: Minimax Decision Search with Alpha-Beta Pruning
  * **Prediction Interfaces**: K-Means Clustering, Decision Tree, CNN Leaf Disease Classifier

---

## Machine Learning Model Training Status

> **Explicit Status Note:**
> The complete application architecture, API contracts, OpenCV preprocessing pipelines, model-loading abstractions (`.pkl`, `.pt`, `.pth`), and user interfaces are **fully implemented and functional**.
> 
> Actual ML model training (K-Means, Decision Tree, CNN) is intentionally postponed to a separate phase. Currently, prediction interfaces return clearly labeled output (`is_trained: false`, `status: "Demo / Model Not Trained"`).

---

## Project Structure

```text
AgroAI/
├── design_folder/         # Locked UI Source of Truth (HTML/MD reference files)
├── frontend/              # React + TypeScript + Vite Application
│   ├── src/
│   │   ├── components/    # AppShell Layout, Navigation, Header
│   │   ├── pages/         # 11 Page views (Dashboard, MyFarm, Fields, Weather, AIAnalysis, etc.)
│   │   ├── services/      # FastAPI API service & Firebase services
│   │   ├── data/          # Sample fields & AI module definitions
│   │   ├── types/         # TypeScript interface definitions
│   │   └── index.css      # Stitch UI design tokens & Tailwind theme
│   └── package.json
├── backend/               # FastAPI Python Application
│   ├── ai/                # AI & Algorithmic Modules (csp, search, minimax, kmeans, dtree, cnn)
│   ├── data/              # CSV field datasets
│   ├── main.py            # FastAPI main entry point & REST API endpoints
│   └── requirements.txt
├── docs/                  # System Architecture, AI Algorithms, API, and Firebase docs
├── Documentation/            # Project contract and development instructions
├── progress.md            # Implementation progress tracking
└── README.md
```

---

## Running the Application

### 1. Start FastAPI Backend

```powershell
cd E:\ai-agro-project\backend
python -m pip install -r requirements.txt
python main.py
```
> API runs on `http://localhost:8000/api`

### 2. Start React Frontend

```powershell
cd E:\ai-agro-project\frontend
npm install
npm run dev
```
> Web UI runs on `http://localhost:3000`

---

## Language and Theme Support

AgroAI supports English (`en`) and Bangla (`bn`) through a centralized frontend i18n provider. The selected language is stored in `localStorage` under `agroai-language` and is applied across routes without reloading the application.

Light (`light`) and dark (`dark`) themes use the existing agricultural design tokens with a forest-and-slate dark palette. The selected theme is stored under `agroai-theme` and is applied before the first React render. Global controls are available in the authenticated header, public authentication pages, and the Settings appearance section.

Locale resources live in `frontend/src/i18n/`, and theme state lives in `frontend/src/theme/ThemeContext.tsx`. Backend API contracts, Firestore collections, machine values, and algorithm identifiers remain unchanged; only application-controlled display text and presentation styles are localized/themed.

---

## Owner & Farmer Ecosystem + Mapbox GIS + Cloudinary

AgroAI provides a role-based agricultural management system supporting two main user roles:

* **Farm Owner (`owner`)**:
  - Full farm & field management (`/owner-dashboard`).
  - Spatial field mapping via **Mapbox GL JS** (`AgroMap`) with Satellite, Street, and Terrain style options.
  - Interactive **Mapbox Draw** tool for defining **Field Boundaries** (Polygon GeoJSON) and **Field Paths** (LineString GeoJSON).
  - Worker directory and field assignment engine (`field_assignments`).
  - Real-time telemetry monitoring and Cloudinary image gallery inspection.
* **Field Worker (`farmer`)**:
  - Mobile-optimized worker workspace (`/farmer-dashboard`).
  - Assigned fields map inspector showing exact Owner-defined boundaries & paths.
  - Soil & land telemetry submission form (moisture, pH, temp, N-P-K, crop growth stage, field notes).
  - Direct unsigned **Cloudinary Image Upload Studio** (`uploadToCloudinary()`) with preview, caption, image classification (`leaf`, `crop`, `soil`, `pest`, `field`), and Disease AI scanner trigger.

> **Environment Variables:** Configured via `frontend/.env` using standard Vite environment variables (`VITE_FIREBASE_API_KEY`, `VITE_MAPBOX_ACCESS_TOKEN`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`).

---

## Primary Application Routes

### Public Routes
* `/login` — Secure Email/Password login interface.
* `/register` — Account registration with role selection (Farm Owner vs Farmer).
* `/forgot-password` — Self-service password reset.

### Protected Application Routes
* `/owner-dashboard` — Owner Enterprise Dashboard with Mapbox GIS, field drawing, worker assignment, and telemetry feeds.
* `/farmer-dashboard` — Farmer Field Worker Workspace with assigned maps, land data forms, and Cloudinary photo uploader.
* `/dashboard` — Smart role-based dashboard router (auto-redirects to Owner or Farmer workspace).
* `/my-farm` — Agricultural Metadata Dossier, field inspector side panel, Add Field modal.
* `/fields` — Complete field CRUD, search bar, health filter tabs, detail cards.
* `/weather` — Micrometeorological observation grid, 6 bento metrics, 7-day forecast.
* `/ai-analysis` — K-Means cluster scatter plot, Decision Engine panel, algorithm triggers.
* `/disease-detection` — Leaf image upload, OpenCV pipeline visualizer, diagnostic results.
* `/irrigation-planner` — Water reservoir bento, 24h Gantt dispatch timeline, AC-3 math formulation card.
* `/resources` — Sensor fleet registry, IoT probes, pump controllers, LoRaWAN gateway.
* `/history` — Immutable audit stream, search/filters, SHA-256 sealed record inspector.
* `/settings` — Enterprise configuration dock, Farm Info form, AI preference toggles, Firebase health ping, language and theme preferences.
* `/messages` — 1:1 real-time chat between farm owners and workers.

* cd d:\AgroAI\backend
python -m pip install -r requirements.txt
python main.py

cd d:\AgroAI\frontend
npm install
npm run dev
