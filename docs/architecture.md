# Architecture
FastAPI + psycopg (raw SQL, transactions per request) + PostgreSQL. JWT (8h) + bcrypt. Every patient route calls `patient_access`: access requires the user's facility to hold a hospital_patient_links row; allowed and denied attempts are written to access_logs. Directory listing, verification and participation are three separate columns on facilities. Retinal model: register a row in ml_models with endpoint_url; `/screenings/{id}/predict` is the single integration point and returns 503 until one exists. Images are stored under uploads/ with sha256 and metadata in retinal_images.
# Not yet built
Consent-based cross-facility access (table + enforcement), document upload for applications, retinal/referral/diagnosis/allergy/prescription/consent UI pages, charts, migrations tooling, automated tests.

# Retinal pipeline (v2)
Upload -> quality gate (app/quality.py: resolution, field coverage, brightness, contrast, sharpness; thresholds via Q_* env vars, heuristic, validate on your images) -> if rejected: status REJECTED_QUALITY, no prediction, no review -> if accepted: POST /screenings/{id}/predict runs ResNet-18 (app/inference.py, weights from ml/train.py, MODEL_PATH) -> doctor review. No Grad-CAM. Run database/migrations/002_quality_and_model.sql on existing databases.
