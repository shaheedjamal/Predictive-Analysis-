from datetime import datetime, timezone
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from app.extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class User(UserMixin, db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    full_name = db.Column(db.String(120), nullable=False)
    institution = db.Column(db.String(150), default="Research Lab")
    role = db.Column(db.String(30), nullable=False, default="Researcher")
    is_active_flag = db.Column(db.Boolean, default=True, nullable=False)
    is_demo = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    last_login = db.Column(db.DateTime)

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    @property
    def is_active(self):
        return self.is_active_flag


class Project(db.Model):
    __tablename__ = "projects"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    is_demo = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utcnow)


class Dataset(db.Model):
    __tablename__ = "datasets"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    filename = db.Column(db.String(200), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id"))
    uploaded_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    is_synthetic_demo = db.Column(db.Boolean, default=False)
    row_count = db.Column(db.Integer, default=0)
    col_count = db.Column(db.Integer, default=0)
    valid_row_count = db.Column(db.Integer, default=0)
    missing_count = db.Column(db.Integer, default=0)
    duplicate_count = db.Column(db.Integer, default=0)
    endpoint = db.Column(db.String(80))
    unit = db.Column(db.String(80))
    status = db.Column(db.String(40), default="uploaded")
    raw_path = db.Column(db.String(300))
    processed_path = db.Column(db.String(300))
    created_at = db.Column(db.DateTime, default=utcnow)


class Compound(db.Model):
    __tablename__ = "compounds"
    id = db.Column(db.Integer, primary_key=True)
    compound_code = db.Column(db.String(80), nullable=False)
    name = db.Column(db.String(150))
    original_smiles = db.Column(db.Text, nullable=False)
    canonical_smiles = db.Column(db.Text, nullable=False)
    molecular_weight = db.Column(db.Float)
    logp = db.Column(db.Float)
    tpsa = db.Column(db.Float)
    hbd = db.Column(db.Integer)
    hba = db.Column(db.Integer)
    rotatable_bonds = db.Column(db.Integer)
    ring_count = db.Column(db.Integer)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utcnow)


class Assay(db.Model):
    __tablename__ = "assays"
    id = db.Column(db.Integer, primary_key=True)
    assay_code = db.Column(db.String(80))
    assay_type = db.Column(db.String(80), nullable=False)
    target_name = db.Column(db.String(120), nullable=False)
    biological_model = db.Column(db.String(120), nullable=False)
    organism = db.Column(db.String(120), nullable=False)
    endpoint = db.Column(db.String(80), nullable=False)
    unit = db.Column(db.String(80), default="pIC50")
    exposure_duration = db.Column(db.String(80))
    created_at = db.Column(db.DateTime, default=utcnow)


class Measurement(db.Model):
    __tablename__ = "measurements"
    id = db.Column(db.Integer, primary_key=True)
    dataset_id = db.Column(db.Integer, db.ForeignKey("datasets.id"), nullable=False)
    record_id = db.Column(db.String(80), nullable=False)
    compound_id = db.Column(db.Integer, db.ForeignKey("compounds.id"))
    assay_id = db.Column(db.Integer, db.ForeignKey("assays.id"))
    value = db.Column(db.Float)
    standard_value = db.Column(db.Float)
    unit = db.Column(db.String(60))
    relation = db.Column(db.String(16))
    source = db.Column(db.String(120))


class MLModel(db.Model):
    __tablename__ = "models"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    algorithm = db.Column(db.String(80), nullable=False)
    version = db.Column(db.String(40), nullable=False)
    dataset_id = db.Column(db.Integer, db.ForeignKey("datasets.id"))
    target_endpoint = db.Column(db.String(80), nullable=False)
    target_unit = db.Column(db.String(80), nullable=False)
    split_method = db.Column(db.String(60), nullable=False)
    mae = db.Column(db.Float, nullable=False)
    rmse = db.Column(db.Float, nullable=False)
    r2 = db.Column(db.Float, nullable=False)
    artifact_path = db.Column(db.String(300), nullable=False)
    is_active = db.Column(db.Boolean, default=False)
    is_demo = db.Column(db.Boolean, default=False)
    status = db.Column(db.String(40), default="trained")
    trained_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utcnow)


class Prediction(db.Model):
    __tablename__ = "predictions"
    id = db.Column(db.Integer, primary_key=True)
    prediction_code = db.Column(db.String(60), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    compound_id = db.Column(db.Integer, db.ForeignKey("compounds.id"), nullable=False)
    assay_id = db.Column(db.Integer, db.ForeignKey("assays.id"), nullable=False)
    model_id = db.Column(db.Integer, db.ForeignKey("models.id"), nullable=False)
    predicted_value = db.Column(db.Float, nullable=False)
    predicted_unit = db.Column(db.String(80), nullable=False)
    applicability_warning = db.Column(db.Text)
    is_demo = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utcnow)


class AuditLog(db.Model):
    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    action = db.Column(db.String(100), nullable=False)
    resource_type = db.Column(db.String(60), nullable=False)
    resource_id = db.Column(db.String(80))
    details = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=utcnow)
