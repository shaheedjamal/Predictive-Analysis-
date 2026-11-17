import os
import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit, ShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app.services.chemistry import compute_descriptors

NUMERIC_FEATURES = [
    "molecular_weight",
    "logp",
    "tpsa",
    "hbd",
    "hba",
    "rotatable_bonds",
    "ring_count",
]
CATEGORICAL_FEATURES = ["assay_type", "organism_or_model"]


def train_models_from_csv(
    csv_path: str,
    models_dir: str,
    split_method: str = "scaffold",
    test_size: float = 0.2,
) -> list[dict]:
    df = pd.read_csv(csv_path)
    desc_rows = []
    valid_idx = []
    for idx, smi in enumerate(df["smiles"]):
        try:
            d = compute_descriptors(str(smi))
            desc_rows.append(d)
            valid_idx.append(idx)
        except ValueError:
            continue

    df = df.iloc[valid_idx].reset_index(drop=True)
    desc_df = pd.DataFrame(desc_rows)
    full_df = pd.concat([df, desc_df], axis=1)

    X = full_df[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
    y = full_df["standard_value"].astype(float).values

    if split_method == "scaffold" and full_df["scaffold_smiles"].nunique() >= 2:
        splitter = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=42)
        train_idx, test_idx = next(splitter.split(X, y, groups=full_df["scaffold_smiles"]))
    elif split_method == "group" and full_df["assay_id"].nunique() >= 2:
        splitter = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=42)
        train_idx, test_idx = next(splitter.split(X, y, groups=full_df["assay_id"]))
    else:
        split_method = "random_exploratory"
        splitter = ShuffleSplit(n_splits=1, test_size=test_size, random_state=42)
        train_idx, test_idx = next(splitter.split(X, y))

    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    # Fit preprocessing strictly on training split to prevent data leakage
    preprocessor = ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]),
                NUMERIC_FEATURES,
            ),
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore"),
                CATEGORICAL_FEATURES,
            ),
        ]
    )

    estimators = {
        "dummy_regressor": DummyRegressor(strategy="mean"),
        "ridge_regression": Ridge(alpha=1.5, random_state=42),
        "random_forest": RandomForestRegressor(n_estimators=100, random_state=42),
        "gradient_boosting": GradientBoostingRegressor(n_estimators=100, random_state=42),
    }

    os.makedirs(models_dir, exist_ok=True)
    results = []
    for algo_name, est in estimators.items():
        pipe = Pipeline([("prep", preprocessor), ("model", est)])
        pipe.fit(X_train, y_train)
        preds = pipe.predict(X_test)

        mae = round(float(mean_absolute_error(y_test, preds)), 4)
        rmse = round(float(root_mean_squared_error(y_test, preds)), 4)
        r2 = round(float(r2_score(y_test, preds)), 4)

        artifact_path = os.path.join(models_dir, f"{algo_name}.joblib")
        joblib.dump({"pipeline": pipe, "train_bounds": X_train[NUMERIC_FEATURES].describe().to_dict()}, artifact_path)

        results.append(
            {
                "algorithm": algo_name,
                "split_method": split_method,
                "mae": mae,
                "rmse": rmse,
                "r2": r2,
                "train_samples": int(len(X_train)),
                "test_samples": int(len(X_test)),
                "artifact_path": artifact_path,
            }
        )

    return results
