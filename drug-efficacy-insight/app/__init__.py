import os
import secrets
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from flask_login import current_user, login_required, login_user, logout_user
from config import Config
from app.extensions import db, login_manager
from app.models import Assay, AuditLog, Compound, Dataset, MLModel, Prediction, User
from app.services.chemistry import compute_descriptors
from ml.train import train_models_from_csv


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


def create_app(test_config=None):
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)

    for folder in [
        app.config["UPLOAD_FOLDER"],
        app.config["PROCESSED_FOLDER"],
        app.config["SAMPLE_FOLDER"],
        app.config["MODELS_FOLDER"],
        app.config["REPORTS_FOLDER"],
        os.path.join(os.path.dirname(app.config["UPLOAD_FOLDER"]), "..", "instance"),
    ]:
        os.makedirs(folder, exist_ok=True)

    CORS(app, supports_credentials=True)
    db.init_app(app)
    login_manager.init_app(app)

    with app.app_context():
        db.create_all()
        admin_email = os.environ.get("ADMIN_BOOTSTRAP_EMAIL")
        admin_pw = os.environ.get("ADMIN_BOOTSTRAP_PASSWORD")
        if admin_email and admin_pw and not User.query.filter_by(email=admin_email).first():
            admin = User(
                username=admin_email.split("@")[0],
                email=admin_email,
                full_name="Configured Administrator",
                role="Administrator",
            )
            admin.set_password(admin_pw)
            db.session.add(admin)
            db.session.commit()

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/api/auth/register", methods=["POST"])
    def register():
        data = request.get_json() or {}
        for field in ("username", "email", "password", "full_name"):
            if not data.get(field):
                return jsonify({"error": f"{field} is required."}), 400
        if User.query.filter((User.email == data["email"]) | (User.username == data["username"])).first():
            return jsonify({"error": "Account already exists."}), 409
        has_admin = User.query.filter_by(role="Administrator").count() > 0
        role = "Administrator" if (not has_admin and data.get("setup_as_admin")) else "Researcher"
        user = User(
            username=data["username"],
            email=data["email"],
            full_name=data["full_name"],
            institution=data.get("institution", "Research Lab"),
            role=role,
        )
        user.set_password(data["password"])
        db.session.add(user)
        db.session.commit()
        login_user(user)
        return jsonify({"user": {"id": user.id, "username": user.username, "role": user.role}}), 201

    @app.route("/api/auth/login", methods=["POST"])
    def login():
        data = request.get_json() or {}
        identifier = data.get("identifier") or data.get("email") or ""
        user = User.query.filter((User.email == identifier) | (User.username == identifier)).first()
        if not user or not user.check_password(data.get("password", "")):
            return jsonify({"error": "Invalid credentials."}), 401
        login_user(user)
        return jsonify({"user": {"id": user.id, "username": user.username, "role": user.role}})

    @app.route("/api/auth/logout", methods=["POST"])
    def logout():
        logout_user()
        return jsonify({"ok": True})

    @app.route("/api/molecules/analyze", methods=["POST"])
    @login_required
    def analyze_molecule():
        data = request.get_json() or {}
        try:
            desc = compute_descriptors(data.get("smiles", ""))
            return jsonify({"valid": True, "descriptors": desc})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @app.route("/api/dashboard/stats", methods=["GET"])
    @login_required
    def dashboard_stats():
        return jsonify(
            {
                "total_users": User.query.count(),
                "total_datasets": Dataset.query.count(),
                "total_predictions": Prediction.query.count(),
                "available_models": MLModel.query.count(),
            }
        )

    @app.route("/api/models/train", methods=["POST"])
    @login_required
    def train_endpoint():
        data = request.get_json() or {}
        csv_path = data.get("csv_path") or os.path.join(app.config["SAMPLE_FOLDER"], "synthetic_demo_drug_response.csv")
        if not os.path.exists(csv_path):
            return jsonify({"error": "Dataset CSV not found."}), 404
        results = train_models_from_csv(csv_path, app.config["MODELS_FOLDER"], data.get("split_method", "scaffold"))
        for r in results:
            m = MLModel(
                name=r["algorithm"],
                algorithm=r["algorithm"],
                version="v1.0",
                target_endpoint="pIC50",
                target_unit="log10_M",
                split_method=r["split_method"],
                mae=r["mae"],
                rmse=r["rmse"],
                r2=r["r2"],
                artifact_path=r["artifact_path"],
                trained_by=current_user.id,
                is_demo=True,
            )
            db.session.add(m)
        db.session.commit()
        return jsonify({"models": results}), 201

    return app
