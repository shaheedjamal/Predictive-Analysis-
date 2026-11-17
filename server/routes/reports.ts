import { Router } from 'express';
import Papa from 'papaparse';
import { getDb } from '../db.ts';
import {
  generatePredictionCsv,
  generatePredictionPdfBuffer,
  type PredictionReportPayload,
} from '../services/reports.ts';
import { logAudit, requireAuth } from '../services/security.ts';

const router = Router();

router.get('/predictions/:id', requireAuth, (req, res) => {
  const db = getDb();
  const idParam = req.params.id;
  const isNumeric = /^\d+$/.test(idParam);

  const row = db
    .prepare(
      `SELECT p.*,
              c.name as compound_name, c.original_smiles, c.canonical_smiles, c.molecular_formula,
              a.endpoint, a.assay_type, a.target_name, a.biological_model, a.organism, a.exposure_duration,
              m.name as model_name, m.algorithm, m.version as model_version, m.split_method, m.mae, m.rmse, m.r2, m.is_demo as model_is_demo,
              u.full_name as user_name, u.username
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

  const descriptors = JSON.parse(String(row.descriptors_json));
  const context = JSON.parse(String(row.context_json));

  const payload: PredictionReportPayload = {
    prediction_code: String(row.prediction_code),
    created_at: String(row.created_at),
    researcher_name: String(row.user_name || row.username || 'Researcher'),
    compound_name: String(row.compound_name || 'Unnamed Compound'),
    original_smiles: String(row.original_smiles),
    canonical_smiles: String(row.canonical_smiles),
    molecular_formula: String(row.molecular_formula || ''),
    descriptors,
    context,
    model: {
      name: String(row.model_name),
      algorithm: String(row.algorithm),
      version: String(row.model_version),
      split_method: String(row.split_method),
      mae: Number(row.mae),
      rmse: Number(row.rmse),
      r2: Number(row.r2),
      is_demo: Boolean(row.model_is_demo),
    },
    predicted_value: Number(row.predicted_value),
    predicted_unit: String(row.predicted_unit),
    in_domain: Boolean(row.in_domain),
    domain_distance: Number(row.domain_distance),
    applicability_warning: row.applicability_warning ? String(row.applicability_warning) : null,
    is_demo: Boolean(row.is_demo),
  };

  const format = String(req.query.format || 'json').toLowerCase();

  logAudit({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'REPORT_EXPORTED',
    resourceType: 'prediction',
    resourceId: payload.prediction_code,
    details: `Exported prediction report as ${format.toUpperCase()}`,
  });

  if (format === 'pdf') {
    const pdfBuffer = generatePredictionPdfBuffer(payload);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="DrugEfficacy_Report_${payload.prediction_code}.pdf"`
    );
    res.send(pdfBuffer);
    return;
  }

  if (format === 'csv') {
    const csv = generatePredictionCsv(payload);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="DrugEfficacy_Report_${payload.prediction_code}.csv"`
    );
    res.send(csv);
    return;
  }

  res.json({ report: payload });
});

router.get('/models/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM models WHERE id = ?')
    .get(Number(req.params.id)) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Model not found.' });
    return;
  }

  const evalPlot = JSON.parse(String(row.evaluation_plot_json)) as {
    actual_vs_predicted: { actual: number; predicted: number; record_id: string }[];
  };

  const rows = evalPlot.actual_vs_predicted.map((pt) => ({
    model_name: row.name,
    version: row.version,
    algorithm: row.algorithm,
    split_method: row.split_method,
    mae: row.mae,
    rmse: row.rmse,
    r2: row.r2,
    record_id: pt.record_id,
    actual_value: pt.actual,
    predicted_value: pt.predicted,
    residual: Number((pt.actual - pt.predicted).toFixed(4)),
    is_demo: Boolean(row.is_demo),
  }));

  const csv = Papa.unparse(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Model_Evaluation_${row.algorithm}_${row.version}.csv"`
  );
  res.send(csv);
});

export default router;
