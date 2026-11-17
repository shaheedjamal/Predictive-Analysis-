import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY") or os.urandom(32).hex()
    SQLALCHEMY_DATABASE_URI = (
        os.environ.get("DATABASE_URL")
        or f"sqlite:///{os.path.join(BASE_DIR, 'instance', 'drug_efficacy.db')}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = os.path.join(BASE_DIR, "data", "uploads")
    PROCESSED_FOLDER = os.path.join(BASE_DIR, "data", "processed")
    SAMPLE_FOLDER = os.path.join(BASE_DIR, "data", "sample")
    MODELS_FOLDER = os.path.join(BASE_DIR, "models")
    REPORTS_FOLDER = os.path.join(BASE_DIR, "reports")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
