# DrugEfficacy Insight — Windows 10/11 & Cross-Platform Guide

**Predictive Analysis of Drug Efficacy Using Machine Learning**

> **Research-Only Disclaimer:** DrugEfficacy Insight is strictly a computational research and educational prototype. It is NOT a medical device, diagnostic instrument, or prescribing application. Predictions must never be interpreted as proof of pharmacological efficacy or clinical safety.

## Windows 10 / Windows 11 Installation

1. Install **Python 3.11** (64-bit) from https://www.python.org/downloads/ (ensure "Add Python to PATH" is checked).
2. Open Command Prompt (`cmd`) or PowerShell inside `drug-efficacy-insight\`:

```bat
python -m venv venv
venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

> **Note on RDKit for Windows:** `rdkit==2024.3.5` provides official Windows x86_64 wheels via PyPI (`pip install rdkit`). If you are on an older Python build where PyPI wheels are unavailable, install via Conda (`conda install -c conda-forge rdkit`) or `pip install rdkit-pypi`.

3. Run the application:

```bat
python run.py
```

4. Open in your browser:

```
http://127.0.0.1:5000
```

## Running Automated Tests

```bat
pytest -v
```
