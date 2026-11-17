import fs from 'node:fs';
import { Router } from 'express';
import Papa from 'papaparse';
import { getDb } from '../db.ts';
import {
  splitRecords,
  trainAndEvaluateAlgorithm,
  type AlgorithmName,
  type SplitMethod,
} from '../services/ml.ts';
import { ensureDataDirs, type CleanedRecord } from '../services/preprocessing.ts';
import { logAudit, requireAuth } from '../services/security.ts';

const router = Router();

const ALGORITHM_LABELS: Record<AlgorithmName, string> = {
  dummy_regressor: 'Dummy Mean Baseline',
  ridge_regression: 'Ridge Regression (L2)',
  random_forest: 'Random Forest Regressor',
  gradient_boosting: 'Gradient Boosting Regressor',
};

router.post('/train', requireAuth, (req, res) => {
  const {
    dataset_id,
    algorithms = [
      'dummy_regressor',
      'ridge_regression',
      'random_forest',
      'gradient_boosting',
    ],
    split_method = 'scaffold',
    test_ratio = 0.2,
    activate_best = true,
  } = req.body ?? {};

  if (!dataset_id) {
    res.status(400).json({ error: 'dataset_id is required to train models.' });
    return;
  }

  const db = getDb();
  const ds = db
    .prepare('SELECT * FROM datasets WHERE id = ?')
    .get(Number(dataset_id)) as
    | {
        id: number;
        name: string;
        status: string;
        endpoint: string;
        unit: string;
        processed_path: string | null;
        is_synthetic_demo: number;
      }
    | undefined;

  if (!ds) {
    res.status(404).json({ error: 'Selected dataset does not exist.' });
    return;
  }

  if (ds.status !== 'preprocessed' || !ds.processed_path || !fs.existsSync(ds.processed_path)) {
    res.status(400).json({
      error: 'Dataset must be preprocessed and validated before training. Please run preprocessing first.',
    });
    return;
  }

  const csvText = fs.readFileSync(ds.processed_path, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  const records: CleanedRecord[] = parsed.data.map((r) => ({
    record_id: r.record_id,
    compound_id: r.compound_id,
    original_smiles: r.original_smiles,
    canonical_smiles: r.canonical_smiles,
    scaffold_smiles: r.scaffold_smiles,
    target_id: r.target_id,
    assay_id: r.assay_id,
    assay_type: r.assay_type,
    organism_or_model: r.organism_or_model,
    endpoint: r.endpoint,
    value: Number(r.value),
    unit: r.unit,
    standard_value: Number(r.standard_value),
    relation: r.relation,
    protocol: r.protocol,
    source: r.source,
    molecular_weight: Number(r.molecular_weight),
    logp: Number(r.logp),
    tpsa: Number(r.tpsa),
    hbd: Number(r.hbd),
    hba: Number(r.hba),
    rotatable_bonds: Number(r.rotatable_bonds),
    ring_count: Number(r.ring_count),
    heavy_atoms: Number(r.heavy_atoms),
    aromatic_atoms: Number(r.aromatic_atoms),
  }));

  if (records.length < 10) {
    res.status(400).json({
      error: `Dataset contains only ${records.length} preprocessed rows. At least 10 rows are required for train/test splitting.`,
    });
    return;
  }

  const allowedAlgos: AlgorithmName[] = [
    'dummy_regressor',
    'ridge_regression',
    'random_forest',
    'gradient_boosting',
  ];
  const requestedAlgos: AlgorithmName[] = Array.isArray(algorithms)
    ? algorithms.filter((a): a is AlgorithmName => allowedAlgos.includes(a))
    : allowedAlgos;

  if (requestedAlgos.length === 0) {
    res.status(400).json({ error: 'Select at least one valid machine-learning algorithm.' });
    return;
  }

  const requestedSplit: SplitMethod = ['scaffold', 'group', 'random_exploratory'].includes(
    split_method
  )
    ? split_method
    : 'scaffold';

  const ratio = Math.max(0.1, Math.min(0.4, Number(test_ratio) || 0.2));
  const split = splitRecords(records, requestedSplit, ratio, 42);
  const dirs = ensureDataDirs();

  const existingCountRow = db
    .prepare('SELECT COUNT(*) as cnt FROM models')
    .get() as { cnt: number };
  const batchNum = existingCountRow.cnt + 1;
  const version = `v1.${batchNum}`;

  const trainedModels: Record<string, unknown>[] = [];
  let bestId = 0;
  let bestR2 = -Infinity;

  for (const algo of requestedAlgos) {
    const { artifact, artifactPath } = trainAndEvaluateAlgorithm({
      trainRecords: split.train,
      testRecords: split.test,
      algorithm: algo,
      version,
      targetEndpoint: ds.endpoint || 'pIC50',
      targetUnit: ds.unit || 'log10_M',
      splitMethod: split.effectiveMethod,
      modelsDir: dirs.modelsDir,
    });

    const label = ds.is_synthetic_demo
      ? `${ALGORITHM_LABELS[algo]} (Synthetic Demo)`
      : `${ALGORITHM_LABELS[algo]} (${ds.name.slice(0, 24)})`;

    const info = db
      .prepare(
        `INSERT INTO models (
          name, algorithm, version, dataset_id, target_endpoint, target_unit,
          split_method, mae, rmse, r2, train_samples, test_samples,
          feature_names_json, feature_importance_json, evaluation_plot_json,
          artifact_path, is_active, is_demo, status, trained_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'trained', ?)`
      )
      .run(
        label,
        algo,
        version,
        ds.id,
        ds.endpoint || 'pIC50',
        ds.unit || 'log10_M',
        split.effectiveMethod,
        artifact.metrics.mae,
        artifact.metrics.rmse,
        artifact.metrics.r2,
        artifact.metrics.train_samples,
        artifact.metrics.test_samples,
        JSON.stringify(artifact.preprocessor.featureNames),
        JSON.stringify(artifact.feature_importance),
        JSON.stringify(artifact.evaluation_plot),
        artifactPath,
        ds.is_synthetic_demo,
        req.user!.id
      );

    const modelId = Number(info.lastInsertRowid);
    if (algo !== 'dummy_regressor' && artifact.metrics.r2 > bestR2) {
      bestR2 = artifact.metrics.r2;
      bestId = modelId;
    }

    trainedModels.push({
      id: modelId,
      name: label,
      algorithm: algo,
      version,
      mae: artifact.metrics.mae,
      rmse: artifact.metrics.rmse,
      r2: artifact.metrics.r2,
      split_method: split.effectiveMethod,
      train_samples: artifact.metrics.train_samples,
      test_samples: artifact.metrics.test_samples,
      is_demo: Boolean(ds.is_synthetic_demo),
    });
  }

  if (activate_best && bestId > 0) {
    db.prepare('UPDATE models SET is_active = 0').run();
    db.prepare('UPDATE models SET is_active = 1 WHERE id = ?').run(bestId);
  }

  logAudit({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'MODELS_TRAINED',
    resourceType: 'model',
    resourceId: version,
    details: `Trained ${requestedAlgos.join(', ')} on dataset #${ds.id} (${ds.name}) using ${split.effectiveMethod} split.`,
    ipAddress: req.ip,
  });

  res.status(201).json({
    models: trainedModels,
    effective_split: split.effectiveMethod,
    activated_model_id: activate_best ? bestId : null,
  });
});

router.get('/', requireAuth, (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT m.id, m.name, m.algorithm, m.version, m.dataset_id, m.target_endpoint, m.target_unit,
              m.split_method, m.mae, m.rmse, m.r2, m.train_samples, m.test_samples,
              m.is_active, m.is_demo, m.status, m.created_at,
              d.name as dataset_name, d.is_synthetic_demo,
              u.full_name as trained_by_name
       FROM models m
       LEFT JOIN datasets d ON d.id = m.dataset_id
       LEFT JOIN users u ON u.id = m.trained_by
       ORDER BY m.id DESC`
    )
    .all();

  res.json({ models: rows });
});

router.get('/:id/metrics', requireAuth, (req, res) => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT m.*, d.name as dataset_name, d.is_synthetic_demo, u.full_name as trained_by_name
       FROM models m
       LEFT JOIN datasets d ON d.id = m.dataset_id
       LEFT JOIN users u ON u.id = m.trained_by
       WHERE m.id = ?`
    )
    .get(Number(req.params.id)) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Model version not found.' });
    return;
  }

  res.json({
    model: {
      ...row,
      feature_names: JSON.parse(String(row.feature_names_json)),
      feature_importance: JSON.parse(String(row.feature_importance_json)),
      evaluation_plot: JSON.parse(String(row.evaluation_plot_json)),
    },
  });
});

router.patch('/:id/activate', requireAuth, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id, name, version FROM models WHERE id = ?').get(id) as
    | { id: number; name: string; version: string }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Model not found.' });
    return;
  }

  db.prepare('UPDATE models SET is_active = 0').run();
  db.prepare('UPDATE models SET is_active = 1 WHERE id = ?').run(id);

  logAudit({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'MODEL_ACTIVATED',
    resourceType: 'model',
    resourceId: id,
    details: `Activated ${existing.name} (${existing.version})`,
  });

  res.json({ ok: true, active_model_id: id });
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = db
    .prepare('SELECT id, name, trained_by, is_active FROM models WHERE id = ?')
    .get(id) as
    | { id: number; name: string; trained_by: number | null; is_active: number }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Model not found.' });
    return;
  }

  if (req.user!.role !== 'Administrator' && existing.trained_by !== req.user!.id) {
    res.status(403).json({ error: 'Only administrators or the model creator can delete this model.' });
    return;
  }

  if (existing.is_active) {
    res.status(400).json({ error: 'Cannot delete the currently active model. Activate another model first.' });
    return;
  }

  db.prepare('DELETE FROM models WHERE id = ?').run(id);
  logAudit({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'MODEL_DELETED',
    resourceType: 'model',
    resourceId: id,
    details: `Deleted ${existing.name}`,
  });

  res.json({ ok: true });
});

export default router;
