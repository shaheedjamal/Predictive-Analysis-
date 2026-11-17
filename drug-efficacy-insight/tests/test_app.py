import pytest
from app import create_app


@pytest.fixture
def client():
    app = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        }
    )
    with app.test_client() as client:
        yield client


def test_register_login_and_smiles(client):
    reg = client.post(
        "/api/auth/register",
        json={
            "username": "test_researcher",
            "email": "test@lab.edu",
            "password": "Password123!",
            "full_name": "Test Researcher",
        },
    )
    assert reg.status_code == 201

    bad_login = client.post(
        "/api/auth/login",
        json={"identifier": "test@lab.edu", "password": "wrong"},
    )
    assert bad_login.status_code == 401

    good_login = client.post(
        "/api/auth/login",
        json={"identifier": "test@lab.edu", "password": "Password123!"},
    )
    assert good_login.status_code == 200

    valid_smi = client.post(
        "/api/molecules/analyze",
        json={"smiles": "CC(=O)Oc1ccccc1C(=O)O"},
    )
    assert valid_smi.status_code == 200
    assert valid_smi.get_json()["descriptors"]["molecular_weight"] > 179

    invalid_smi = client.post(
        "/api/molecules/analyze",
        json={"smiles": "INVALID_SMILES_((("},
    )
    assert invalid_smi.status_code == 400
