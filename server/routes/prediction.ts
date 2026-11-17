import fs from 'node:fs';
import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb } from '../db.ts';
import { analyzeSmiles } from '../services/chemistry.ts';
import { predictWithArtifact, type TrainedModelArtifact } from '../services/ml.ts';
import { logAudit, requireAuth } from '../services/security.ts';

const router = Router();

router.post('/molecules/analyze', requireAuth, (req, res) => {
  const { smiles } = req.body ?? {};
  const result = analyzeSmiles(smiles);
  if (!result.valid || !result.descriptors) {
    res.status(400).json({ error: result.error || 'Invalid SMILES structure.' });
    return;
  }
  res.json({ valid: true, descriptors: result.descriptors });
});

router.post('/predict', requireAuth, (req, res) => {
  const {
    compound_name,
    smiles,
    assay_type,
    target_name,
    biological_model,
    organism,
    endpoint,
    exposure_duration,
    model_id,
  } = req.body ?? {};

  if (!smiles || !assay_type || !target_name || !biological_model || !organism || !endpoint) {
    res.status(400).json({
      error:
        'Required fields missing: smiles, assay_type, target_name, biological_model, organism, and endpoint are required.',
    });
    return;
  }

  const smiResult = analyzeSmiles(String(smiles));
  if (!smiResult.valid || !smiResult.descriptors) {
    res.status(400).json({ error: smiResult.error || 'Invalid SMILES structure.' });
    return;
  }
  const descriptors = smiResult.descriptors;

  const db = getDb();
  let modelRow:
    | {
        id: number;
        name: string;
        algorithm: string;
        version: string;
        target_endpoint: string;
        target_unit: string;
        artifact_path: string;
        is_demo: number;
        mae: number;
        rmse: number;
        r2: number;
        split_method: string;
      }
    | undefined;

  if (model_id) {
    modelRow = db
      .prepare('SELECT * FROM models WHERE id = ?')
      .get(Number(model_id)) as typeof modelRow;
  } else {
    modelRow = db
      .prepare('SELECT * FROM models WHERE is_active = 1 ORDER BY id DESC LIMIT 1')
      .get() as typeof modelRow;
    if (!modelRow) {
      modelRow = db
        .prepare('SELECT * FROM models ORDER BY id DESC LIMIT 1')
        .get() as typeof modelRow;
    }
  }

  if (!modelRow) {
    res.status(404).json({ error: 'No trained model is currently available. Please train a model first.' });
    return;
  }

  if (String(endpoint).trim() !== modelRow.target_endpoint) {
    res.status(400).json({
      error: `Selected model "${modelRow.name}" estimates endpoint "${modelRow.target_endpoint}", which does not match requested endpoint "${endpoint}". Please select a compatible model or matching endpoint.`,
    });
    return;
  }

  if (!fs.existsSync(modelRow.artifact_path)) {
    res.status(500).json({ error: 'Model artifact file is missing on disk. Please retrain the model.' });
    return;
  }

  const artifact = JSON.parse(
    fs.readFileSync(modelRow.artifact_path, 'utf-8')
  ) as TrainedModelArtifact;

  const predictionOutput = predictWithArtifact(artifact, descriptors, {
    assay_type: String(assay_type).trim(),
    organism_or_model: String(organism).trim(),
  });

  const cleanName = compound_name ? String(compound_name).trim() : 'Unnamed Compound';
  const predictionCode = `PRED-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase()}`;

  const cRes = db
    .prepare(
      `INSERT INTO compounds (
        compound_code, name, original_smiles, canonical_smiles, molecular_formula,
        molecular_weight, logp, tpsa, hbd, hba, rotatable_bonds, ring_count, heavy_atoms, scaffold_smiles, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      predictionCode,
      cleanName,
      descriptors.original_smiles,
      descriptors.canonical_smiles,
      descriptors.molecular_formula,
      descriptors.molecular_weight,
      descriptors.logp,
      descriptors.tpsa,
      descriptors.hbd,
      descriptors.hba,
      descriptors.rotatable_bonds,
      descriptors.ring_count,
      descriptors.heavy_atoms,
      descriptors.scaffold_smiles,
      req.user!.id
    );
  const compoundId = Number(cRes.lastInsertRowid);

  const aRes = db
    .prepare(
      `INSERT INTO assays (assay_code, assay_type, target_name, biological_model, organism, endpoint, unit, exposure_duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      predictionCode,
      String(assay_type).trim(),
      String(target_name).trim(),
      String(biological_model).trim(),
      String(organism).trim(),
      String(endpoint).trim(),
      modelRow.target_unit,
      exposure_duration ? String(exposure_duration).trim() : null
    );
  const assayId = Number(aRes.lastInsertRowid);

  const descriptorsSummary = {
    molecular_weight: descriptors.molecular_weight,
    logp: descriptors.logp,
    tpsa: descriptors.tpsa,
    hbd: descriptors.hbd,
    hba: descriptors.hba,
    rotatable_bonds: descriptors.rotatable_bonds,
    ring_count: descriptors.ring_count,
    heavy_atoms: descriptors.heavy_atoms,
    aromatic_atoms: descriptors.aromatic_atoms,
    lipinski_violations: descriptors.lipinski_violations,
    veber_compliant: descriptors.veber_compliant,
  };

  const contextSummary = {
    assay_type: String(assay_type).trim(),
    target_name: String(target_name).trim(),
    biological_model: String(biological_model).trim(),
    organism: String(organism).trim(),
    endpoint: String(endpoint).trim(),
    exposure_duration: exposure_duration ? String(exposure_duration).trim() : '',
  };

  const pRes = db
    .prepare(
      `INSERT INTO predictions (
        prediction_code, user_id, compound_id, assay_id, model_id,
        predicted_value, predicted_unit, in_domain, domain_distance, applicability_warning,
        descriptors_json, context_json, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      predictionCode,
      req.user!.id,
      compoundId,
      assayId,
      modelRow.id,
      predictionOutput.predicted_value,
      modelRow.target_unit,
      predictionOutput.in_domain ? 1 : 0,
      predictionOutput.domain_distance,
      predictionOutput.applicability_warning,
      JSON.stringify(descriptorsSummary),
      JSON.stringify(contextSummary),
      modelRow.is_demo
    );
  const predictionId = Number(pRes.lastInsertRowid);

  logAudit({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'PREDICTION_CREATED',
    resourceType: 'prediction',
    resourceId: predictionCode,
    details: `Compound=${cleanName}, Model=${modelRow.name} (${modelRow.version}), Estimate=${predictionOutput.predicted_value} ${modelRow.target_unit}`,
    ipAddress: req.ip,
  });

  const saved = db
    .prepare('SELECT created_at FROM predictions WHERE id = ?')
    .get(predictionId) as { created_at: string };

  res.status(201).json({
    id: predictionId,
    prediction_code: predictionCode,
    created_at: saved.created_at,
    compound: {
      name: cleanName,
      original_smiles: descriptors.original_smiles,
      canonical_smiles: descriptors.canonical_smiles,
      molecular_formula: descriptors.molecular_formula,
      svg: descriptors.svg,
    },
    descriptors: descriptorsSummary,
    context: contextSummary,
    prediction: {
      predicted_value: predictionOutput.predicted_value,
      predicted_unit: modelRow.target_unit,
      endpoint: modelRow.target_endpoint,
      in_domain: predictionOutput.in_domain,
      domain_distance: predictionOutput.domain_distance,
      applicability_warning: predictionOutput.applicability_warning,
    },
    model: {
      id: modelRow.id,
      name: modelRow.name,
      algorithm: modelRow.algorithm,
      version: modelRow.version,
      split_method: modelRow.split_method,
      mae: modelRow.mae,
      rmse: modelRow.rmse,
      r2: modelRow.r2,
      is_demo: Boolean(modelRow.is_demo),
    },
    disclaimer:
      'Research and educational estimate only. This computational output does not constitute proof of pharmacological efficacy or clinical safety and is not intended for medical diagnosis or prescribing.',
  });
});

router.get('/predictions', requireAuth, (req, res) => {
  const db = getDb();
  const { search = '', endpoint = '', model_id = '', sort = 'newest' } = req.query;

  const where: string[] = [];
  const params: (string | number)[] = [];

  if (search) {
    where.push(
      '(p.prediction_code LIKE ? OR c.name LIKE ? OR c.canonical_smiles LIKE ? OR a.target_name LIKE ?)'
    );
    const term = `%${String(search).trim()}%`;
    params.push(term, term, term, term);
  }
  if (endpoint) {
    where.push('a.endpoint = ?');
    params.push(String(endpoint));
  }
  if (model_id) {
    where.push('p.model_id = ?');
    params.push(Number(model_id));
  }

  const orderSql =
    sort === 'oldest'
      ? 'p.id ASC'
      : sort === 'value_desc'
        ? 'p.predicted_value DESC'
        : sort === 'value_asc'
          ? 'p.predicted_value ASC'
          : 'p.id DESC';

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT p.id, p.prediction_code, p.user_id, p.predicted_value, p.predicted_unit,
              p.in_domain, p.domain_distance, p.applicability_warning,
              p.descriptors_json, p.context_json, p.is_demo, p.created_at,
              c.name as compound_name, c.original_smiles, c.canonical_smiles, c.molecular_formula,
              a.endpoint, a.assay_type, a.target_name, a.biological_model, a.organism, a.exposure_duration,
              m.name as model_name, m.algorithm, m.version as model_version,
              u.username, u.full_name as user_name
       FROM predictions p
       JOIN compounds c ON c.id = p.compound_id
       JOIN assays a ON a.id = p.assay_id
       JOIN models m ON m.id = p.model_id
       LEFT JOIN users u ON u.id = p.user_id
       ${whereClause}
       ORDER BY ${orderSql}`
    )
    .all(...params);

  res.json({ predictions: rows });
});

router.get('/predictions/:id', requireAuth, (req, res) => {
  const db = getDb();
  const idParam = req.params.id;
  const isNumeric = /^\d+$/.test(idParam);

  const row = db
    .prepare(
      `SELECT p.*,
              c.name as compound_name, c.original_smiles, c.canonical_smiles, c.molecular_formula,
              a.endpoint, a.assay_type, a.target_name, a.biological_model, a.organism, a.exposure_duration,
              m.name as model_name, m.algorithm, m.version as model_version, m.split_method, m.mae, m.rmse, m.r2,
              u.username, u.full_name as user_name
       FROM predictions p
       JOIN compounds c ON c.id = p.compound_id
       JOIN assays a ON a.id = p.assay_id
       JOIN models m ON m.id = p.model_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE ${isNumeric ? 'p.id = ?' : 'p.prediction_code = ?'}`
    )
    .get(isNumeric ? Number(idParam) : idParam) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Prediction record not found.' });
    return;
  }

  const smi = analyzeSmiles(String(row.canonical_smiles || row.original_smiles));
  res.json({
    prediction: {
      ...row,
      descriptors: JSON.parse(String(row.descriptors_json)),
      context: JSON.parse(String(row.context_json)),
      svg: smi.descriptors?.svg ?? '',
    },
  });
});

router.delete('/predictions/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT id, user_id, prediction_code FROM predictions WHERE id = ?')
    .get(id) as { id: number; user_id: number | null; prediction_code: string } | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Prediction record not found.' });
    return;
  }

  if (req.user!.role !== 'Administrator' && existing.user_id !== req.user!.id) {
    res.status(403).json({ error: 'You are not authorized to delete this prediction record.' });
    return;
  }

  db.prepare('DELETE FROM predictions WHERE id = ?').run(id);
  logAudit({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'PREDICTION_DELETED',
    resourceType: 'prediction',
    resourceId: existing.prediction_code,
    ipAddress: req.ip,
  });

  res.json({ ok: true });
});

export default router;
