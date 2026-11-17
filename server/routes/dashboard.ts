import { Router } from 'express';
import { getDb } from '../db.ts';
import { requireAuth } from '../services/security.ts';

const router = Router();

router.get('/stats', requireAuth, (_req, res) => {
  const db = getDb();

  const totalUsers = (
    db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }
  ).cnt;
  const totalDatasets = (
    db.prepare('SELECT COUNT(*) as cnt FROM datasets').get() as { cnt: number }
  ).cnt;
  const totalPredictions = (
    db.prepare('SELECT COUNT(*) as cnt FROM predictions').get() as { cnt: number }
  ).cnt;
  const totalModels = (
    db.prepare('SELECT COUNT(*) as cnt FROM models').get() as { cnt: number }
  ).cnt;

  const latestModel = db
    .prepare(
      `SELECT id, name, algorithm, version, status, r2, rmse, mae, split_method, is_demo, created_at
       FROM models ORDER BY id DESC LIMIT 1`
    )
    .get() as Record<string, unknown> | undefined;

  const activeModel = db
    .prepare(
      `SELECT id, name, algorithm, version, status, r2, rmse, mae, split_method, is_demo, created_at
       FROM models WHERE is_active = 1 ORDER BY id DESC LIMIT 1`
    )
    .get() as Record<string, unknown> | undefined;

  // Prediction activity grouped by date
  const activityRows = db
    .prepare(
      `SELECT substr(created_at, 1, 10) as day, COUNT(*) as count
       FROM predictions
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day ASC
       LIMIT 14`
    )
    .all() as { day: string; count: number }[];

  // Dataset / measurement distribution by assay_type
  const assayDistribution = db
    .prepare(
      `SELECT a.assay_type as label, COUNT(m.id) as count
       FROM measurements m
       JOIN assays a ON a.id = m.assay_id
       GROUP BY a.assay_type
       ORDER BY count DESC`
    )
    .all() as { label: string; count: number }[];

  // Model comparison metrics
  const modelComparison = db
    .prepare(
      `SELECT id, name, algorithm, version, mae, rmse, r2, split_method, is_active, is_demo, created_at
       FROM models
       ORDER BY id DESC
       LIMIT 8`
    )
    .all() as Record<string, unknown>[];

  // Experimental response distribution (binned standard_value from measurements)
  const measurementValues = db
    .prepare('SELECT standard_value FROM measurements WHERE standard_value IS NOT NULL')
    .all() as { standard_value: number }[];

  const responseDistribution: { bin: string; count: number }[] = [];
  if (measurementValues.length > 0) {
    const vals = measurementValues.map((r) => r.standard_value);
    const min = Math.floor(Math.min(...vals) * 2) / 2;
    const max = Math.ceil(Math.max(...vals) * 2) / 2;
    const bins = 8;
    const step = (max - min || 1) / bins;
    const counts = Array(bins).fill(0);
    for (const v of vals) {
      let idx = Math.floor((v - min) / step);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      counts[idx]++;
    }
    for (let i = 0; i < bins; i++) {
      responseDistribution.push({
        bin: `${(min + i * step).toFixed(1)}–${(min + (i + 1) * step).toFixed(1)}`,
        count: counts[i],
      });
    }
  }

  // Recent predictions
  const recentPredictions = db
    .prepare(
      `SELECT p.id, p.prediction_code, p.predicted_value, p.predicted_unit, p.in_domain, p.is_demo, p.created_at,
              c.name as compound_name, c.canonical_smiles,
              a.endpoint, a.target_name, a.assay_type,
              m.name as model_name, m.version as model_version,
              u.full_name as user_name
       FROM predictions p
       JOIN compounds c ON c.id = p.compound_id
       JOIN assays a ON a.id = p.assay_id
       JOIN models m ON m.id = p.model_id
       LEFT JOIN users u ON u.id = p.user_id
       ORDER BY p.id DESC
       LIMIT 6`
    )
    .all();

  // Recent activities from audit logs
  const recentActivities = db
    .prepare(
      `SELECT id, username, action, resource_type, resource_id, details, created_at
       FROM audit_logs
       ORDER BY id DESC
       LIMIT 8`
    )
    .all();

  // Demo mode status
  const demoDatasetsCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM datasets WHERE is_synthetic_demo = 1').get() as {
      cnt: number;
    }
  ).cnt;
  const realDatasetsCount = (
    db.prepare('SELECT COUNT(*) as cnt FROM datasets WHERE is_synthetic_demo = 0').get() as {
      cnt: number;
    }
  ).cnt;

  res.json({
    summary: {
      total_users: totalUsers,
      total_datasets: totalDatasets,
      total_predictions: totalPredictions,
      available_models: totalModels,
      latest_training_status: latestModel ? latestModel.status : 'none',
      latest_model_name: latestModel ? latestModel.name : null,
      active_model: activeModel ?? null,
    },
    charts: {
      prediction_activity: activityRows,
      dataset_distribution: assayDistribution,
      model_comparison: modelComparison,
      response_distribution: responseDistribution,
    },
    recent_predictions: recentPredictions,
    recent_activities: recentActivities,
    models: modelComparison,
    system_status: {
      database_engine: 'SQLite (Local)',
      cheminformatics_engine: 'OpenChemLib SMILES + Descriptor Kernel',
      ml_pipeline: 'Ridge / Random Forest / Gradient Boosting / Dummy Baseline',
      demo_mode_active: Boolean(activeModel?.is_demo) || realDatasetsCount === 0,
      synthetic_datasets: demoDatasetsCount,
      user_datasets: realDatasetsCount,
    },
  });
});

export default router;
