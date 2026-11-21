import os
from dotenv import load_dotenv

load_dotenv()

# Ensure Keras directory stays inside the project workspace
os.environ.setdefault("KERAS_HOME", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".keras"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import auth_admin, clinical

from fastapi.security import HTTPBearer

app = FastAPI(
    title="Arovia API",
    version="0.1.0",
    swagger_ui_parameters={"persistAuthorization": True}
)

security = HTTPBearer()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("CORS_ORIGIN", "http://localhost:5173")],
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(auth_admin.r, prefix="/api")
app.include_router(clinical.r, prefix="/api")

@app.get("/api/health")
def health():
    return {"status": "ok"}