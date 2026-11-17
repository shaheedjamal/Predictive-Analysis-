import * as OCL from 'openchemlib';

export interface MolecularDescriptors {
  original_smiles: string;
  canonical_smiles: string;
  molecular_formula: string;
  molecular_weight: number;
  logp: number;
  tpsa: number;
  hbd: number;
  hba: number;
  rotatable_bonds: number;
  ring_count: number;
  heavy_atoms: number;
  aromatic_atoms: number;
  scaffold_smiles: string;
  lipinski_violations: number;
  veber_compliant: boolean;
  svg: string;
}

export interface SmilesValidationResult {
  valid: boolean;
  error?: string;
  descriptors?: MolecularDescriptors;
}

export function analyzeSmiles(rawSmiles: string): SmilesValidationResult {
  if (typeof rawSmiles !== 'string') {
    return { valid: false, error: 'SMILES input must be a text string.' };
  }

  const trimmed = rawSmiles.trim();
  if (!trimmed) {
    return { valid: false, error: 'SMILES string cannot be empty.' };
  }

  if (/\s/.test(trimmed)) {
    return {
      valid: false,
      error: 'Invalid SMILES: whitespace characters are not permitted inside a SMILES string.',
    };
  }

  // Reject bare punctuation or digits
  if (!/[A-Za-z]/.test(trimmed)) {
    return { valid: false, error: 'Invalid SMILES: no chemical element symbols detected.' };
  }

  try {
    const mol = OCL.Molecule.fromSmiles(trimmed);
    mol.ensureHelperArrays(OCL.Molecule.cHelperRings);

    const atomCount = mol.getAllAtoms();
    if (atomCount === 0) {
      return { valid: false, error: 'Invalid SMILES: molecule contains zero atoms.' };
    }

    // Check valence / abnormal chemistry warnings if any atom has unknown atomic number 0
    for (let i = 0; i < atomCount; i++) {
      if (mol.getAtomicNo(i) <= 0) {
        return {
          valid: false,
          error: 'Invalid SMILES: contains unrecognised or wildcard atom symbols.',
        };
      }
    }

    const canonical = mol.toSmiles();
    const formulaObj = mol.getMolecularFormula();
    const props = new OCL.MoleculeProperties(mol);

    const mw = Number(formulaObj.relativeWeight.toFixed(3));
    const logp = Number(props.logP.toFixed(3));
    const tpsa = Number(props.polarSurfaceArea.toFixed(2));
    const hbd = props.donorCount;
    const hba = props.acceptorCount;
    const rotatableBonds = props.rotatableBondCount;
    const ringCount = mol.getRingSet().getSize();
    const heavyAtoms = mol.getAtoms();

    let aromaticAtoms = 0;
    for (let i = 0; i < heavyAtoms; i++) {
      if (mol.isAromaticAtom(i)) aromaticAtoms++;
    }

    // Extract Murcko-style scaffold signature for scaffold-based dataset splitting:
    // If molecule has rings, extract ring atoms + connecting linker paths; otherwise acyclic core
    const scaffoldSmiles = computeScaffoldSignature(mol, ringCount);

    let lipinskiViolations = 0;
    if (mw > 500) lipinskiViolations++;
    if (logp > 5) lipinskiViolations++;
    if (hbd > 5) lipinskiViolations++;
    if (hba > 10) lipinskiViolations++;

    const veberCompliant = rotatableBonds <= 10 && tpsa <= 140;

    // Generate clean 2D coordinates & SVG depiction
    const svgMol = mol.getCompactCopy();
    svgMol.inventCoordinates();
    const svg = svgMol.toSVG(280, 200, undefined, {
      noImplicitAtomLabelColors: false,
      suppressChiralText: true,
      suppressESR: true,
    });

    return {
      valid: true,
      descriptors: {
        original_smiles: trimmed,
        canonical_smiles: canonical,
        molecular_formula: formulaObj.formula,
        molecular_weight: mw,
        logp,
        tpsa,
        hbd,
        hba,
        rotatable_bonds: rotatableBonds,
        ring_count: ringCount,
        heavy_atoms: heavyAtoms,
        aromatic_atoms: aromaticAtoms,
        scaffold_smiles: scaffoldSmiles,
        lipinski_violations: lipinskiViolations,
        veber_compliant: veberCompliant,
        svg,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Malformed SMILES syntax';
    return {
      valid: false,
      error: `Invalid SMILES structure (${message}). Please verify ring closures, brackets, and valence.`,
    };
  }
}

function computeScaffoldSignature(mol: OCL.Molecule, ringCount: number): string {
  if (ringCount === 0) {
    return 'ACYCLIC_CORE';
  }
  try {
    const copy = mol.getCompactCopy();
    copy.ensureHelperArrays(OCL.Molecule.cHelperRings);
    // Prune degree-1 non-ring terminal substituents iteratively to yield core Murcko framework
    let changed = true;
    while (changed) {
      changed = false;
      const n = copy.getAtoms();
      for (let i = n - 1; i >= 0; i--) {
        if (!copy.isRingAtom(i) && copy.getConnAtoms(i) <= 1) {
          copy.deleteAtom(i);
          changed = true;
        }
      }
      if (changed) {
        copy.ensureHelperArrays(OCL.Molecule.cHelperRings);
      }
    }
    const scaffold = copy.toSmiles();
    return scaffold || 'RING_CORE';
  } catch {
    return `RINGS_${ringCount}`;
  }
}
