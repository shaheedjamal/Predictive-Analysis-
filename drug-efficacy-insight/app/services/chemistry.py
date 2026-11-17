from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen, rdMolDescriptors
from rdkit.Chem.Scaffolds import MurckoScaffold


def compute_descriptors(raw_smiles: str) -> dict:
    if not isinstance(raw_smiles, str) or not raw_smiles.strip():
        raise ValueError("SMILES string cannot be empty.")

    cleaned = raw_smiles.strip()
    mol = Chem.MolFromSmiles(cleaned)
    if mol is None:
        raise ValueError(f"Invalid SMILES molecular structure: {cleaned}")

    canonical = Chem.MolToSmiles(mol, canonical=True)
    scaffold = MurckoScaffold.MurckoScaffoldSmiles(mol=mol)

    return {
        "original_smiles": cleaned,
        "canonical_smiles": canonical,
        "scaffold_smiles": scaffold or "ACYCLIC",
        "molecular_weight": round(float(Descriptors.MolWt(mol)), 3),
        "logp": round(float(Crippen.MolLogP(mol)), 3),
        "tpsa": round(float(rdMolDescriptors.CalcTPSA(mol)), 2),
        "hbd": int(rdMolDescriptors.CalcNumHBD(mol)),
        "hba": int(rdMolDescriptors.CalcNumHBA(mol)),
        "rotatable_bonds": int(rdMolDescriptors.CalcNumRotatableBonds(mol)),
        "ring_count": int(rdMolDescriptors.CalcNumRings(mol)),
    }
