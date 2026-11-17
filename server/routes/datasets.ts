import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { getDb } from '../db.ts';
import { analyzeSmiles } from '../services/chemistry.ts';
import {
  ensureDataDirs,
  inspectDatasetCsv,
  preprocessDatasetCsv,
} from '../services/preprocessing.ts';
import { logAudit, requireAuth, sanitizeFilename } from '../services/security.ts';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  try {
    let csvText = '';
    let originalFilename = 'uploaded_dataset.csv';

    if (req.file) {
      if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
        res.status(400).json({ error: 'Only .csv dataset files are permitted.' });
        return;
      }
      csvText = req.file.buffer.toString('utf-8');
      originalFilename = sanitizeFilename(req.file.originalname);
    } else if (req.body?.csv_content) {
      csvText = String(req.body.csv_content);
      originalFilename = sanitizeFilename(String(req.body.filename || 'dataset.csv'));
    } else {
      res.status(400).json({ error: 'Please attach a CSV file or provide csv_content.' });
      return;
    }

    if (!csvText.trim()) {
      res.status(400).json({ error: 'Uploaded CSV file is empty.' });
      return;
    }

    const diag = inspectDatasetCsv(csvText);
    if (diag.row_count === 0) {
      res.status(400).json({ error: 'CSV file contains headers but zero data rows.' });
      return;
    }

    const dirs = ensureDataDirs();
    const storedName = `${Date.now()}_${originalFilename}`;
    const rawPath = path.join(dirs.uploadsDir, storedName);
    fs.writeFileSync(rawPath, csvText, 'utf-8');

    const datasetName =
      String(req.body?.name || '').trim() ||
      originalFilename.replace(/\.csv$/i, '');

    const isSyntheticDemo =
      req.body?.is_synthetic_demo === true || req.body?.is_synthetic_demo === 'true' ? 1 : 0;

    const endpoints = Object.keys(diag.endpoints);
    const units = Object.keys(diag.units);
    const dominantEndpoint = endpoints[0] ?? null;
    const dominantUnit = units[0] ?? null;
    const schemaValid = diag.missing_columns.length === 0 ? 1 : 0;

    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO datasets (
          name, filename, uploaded_by, is_synthetic_demo,
          row_count, col_count, valid_row_count, missing_count, duplicate_count,
          endpoint, unit, schema_valid, status, raw_path, stats_json, validation_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        datasetName,
        originalFilename,
        req.user!.id,
        isSyntheticDemo,
        diag.row_count,
        diag.col_count,
        Math.max(0, diag.row_count - diag.invalid_smiles_count - diag.invalid_numeric_count),
        diag.total_missing_cells,
        diag.duplicate_count,
        dominantEndpoint,
        dominantUnit,
        schemaValid,
        schemaValid ? 'validated' : 'schema_warning',
        rawPath,
        JSON.stringify(diag),
        diag.compatibility_warning ||
          (diag.missing_columns.length > 0
            ? `Missing columns: ${diag.missing_columns.join(', ')}`
            : 'Schema validated.')
      );

    const datasetId = Number(info.lastInsertRowid);
    logAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'DATASET_UPLOADED',
      resourceType: 'dataset',
      resourceId: datasetId,
      details: `Uploaded ${originalFilename} (${diag.row_count} rows, ${diag.col_count} cols)`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      dataset: db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId),
      diagnostics: diag,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to parse CSV upload.';
    res.status(400).json({ error: msg });
  }
});

router.get('/', requireAuth, (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT d.*, u.username as uploader_username, u.full_name as uploader_name
       FROM datasets d
       LEFT JOIN users u ON u.id = d.uploaded_by
       ORDER BY d.id DESC`
    )
    .all();
  res.json({ datasets: rows });
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const ds = db
    .prepare(
      `SELECT d.*, u.username as uploader_username, u.full_name as uploader_name
       FROM datasets d
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.id = ?`
    )
    .get(Number(req.params.id)) as Record<string, unknown> | undefined;

  if (!ds) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }

  let diagnostics = null;
  if (ds.stats_json) {
    try {
      diagnostics = JSON.parse(String(ds.stats_json));
    } catch {
      diagnostics = null;
    }
  }
  res.json({ dataset: ds, diagnostics });
});

router.post('/:id/preprocess', requireAuth, (req, res) => {
  const db = getDb();
  const datasetId = Number(req.params.id);
  const ds = db
    .prepare('SELECT * FROM datasets WHERE id = ?')
    .get(datasetId) as
    | {
        id: number;
        name: string;
        raw_path: string;
        is_synthetic_demo: number;
      }
    | undefined;

  if (!ds) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }
  if (!ds.raw_path || !fs.existsSync(ds.raw_path)) {
    res.status(404).json({ error: 'Raw CSV file for this dataset is missing on disk.' });
    return;
  }

  try {
    const csvText = fs.readFileSync(ds.raw_path, 'utf-8');
    const { target_endpoint, target_unit } = req.body ?? {};
    const prep = preprocessDatasetCsv(
      csvText,
      target_endpoint ? String(target_endpoint).trim() : undefined,
      target_unit ? String(target_unit).trim() : undefined
    );

    if (prep.cleaned.length < 5) {
      res.status(400).json({
        error: `Only ${prep.cleaned.length} valid records remained after cleaning (${prep.dropped_rows.length} dropped). At least 5 clean records are required.`,
        dropped_rows: prep.dropped_rows,
      });
      return;
    }

    const dirs = ensureDataDirs();
    const processedPath = path.join(
      dirs.processedDir,
      `dataset_${datasetId}_processed.csv`
    );
    fs.writeFileSync(processedPath, prep.processed_csv, 'utf-8');

    // Refresh measurements for this dataset
    db.prepare('DELETE FROM measurements WHERE dataset_id = ?').run(datasetId);

    const insertCompound = db.prepare(
      `INSERT INTO compounds (
        compound_code, name, original_smiles, canonical_smiles, molecular_formula,
        molecular_weight, logp, tpsa, hbd, hba, rotatable_bonds, ring_count, heavy_atoms, scaffold_smiles, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertAssay = db.prepare(
      `INSERT INTO assays (assay_code, assay_type, target_name, biological_model, organism, endpoint, unit, protocol)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertMeasurement = db.prepare(
      `INSERT INTO measurements (dataset_id, record_id, compound_id, assay_id, scaffold_group, value, standard_value, unit, relation, source, is_valid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );

    for (const rec of prep.cleaned) {
      const smi = analyzeSmiles(rec.original_smiles);
      const d = smi.descriptors!;
      const cRes = insertCompound.run(
        rec.compound_id,
        rec.compound_id,
        rec.original_smiles,
        rec.canonical_smiles,
        d.molecular_formula,
        d.molecular_weight,
        d.logp,
        d.tpsa,
        d.hbd,
        d.hba,
        d.rotatable_bonds,
        d.ring_count,
        d.heavy_atoms,
        d.scaffold_smiles,
        req.user!.id
      );
      const compId = Number(cRes.lastInsertRowid);

      const aRes = insertAssay.run(
        rec.assay_id,
        rec.assay_type,
        rec.target_id,
        rec.organism_or_model,
        rec.organism_or_model,
        rec.endpoint,
        rec.unit,
        rec.protocol
      );
      const assayId = Number(aRes.lastInsertRowid);

      insertMeasurement.run(
        datasetId,
        rec.record_id,
        compId,
        assayId,
        rec.scaffold_smiles,
        rec.value,
        rec.standard_value,
        rec.unit,
        rec.relation,
        rec.source
      );
    }

    const updatedDiag = inspectDatasetCsv(csvText);
    db.prepare(
      `UPDATE datasets
       SET valid_row_count = ?, endpoint = ?, unit = ?, schema_valid = 1,
           status = 'preprocessed', processed_path = ?, stats_json = ?,
           validation_notes = ?
       WHERE id = ?`
    ).run(
      prep.cleaned.length,
      prep.endpoint,
      prep.unit,
      processedPath,
      JSON.stringify(updatedDiag),
      `Preprocessed ${prep.cleaned.length} valid records for ${prep.endpoint} (${prep.unit}). Dropped ${prep.dropped_rows.length} invalid/incompatible rows.`,
      datasetId
    );

    logAudit({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'DATASET_PREPROCESSED',
      resourceType: 'dataset',
      resourceId: datasetId,
      details: `Cleaned ${prep.cleaned.length} rows; dropped ${prep.dropped_rows.length} rows`,
    });

    res.json({
      dataset: db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId),
      cleaned_count: prep.cleaned.length,
      dropped_count: prep.dropped_rows.length,
      dropped_rows: prep.dropped_rows.slice(0, 20),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Preprocessing failed.';
    res.status(400).json({ error: msg });
  }
});

router.get('/:id/download', requireAuth, (req, res) => {
  const db = getDb();
  const ds = db
    .prepare('SELECT id, name, filename, raw_path, processed_path FROM datasets WHERE id = ?')
    .get(Number(req.params.id)) as
    | {
        id: number;
        name: string;
        filename: string;
        raw_path: string;
        processed_path: string | null;
      }
    | undefined;

  if (!ds) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }

  const targetType = req.query.type === 'raw' ? 'raw' : 'processed';
  const filePath =
    targetType === 'processed' && ds.processed_path && fs.existsSync(ds.processed_path)
      ? ds.processed_path
      : ds.raw_path;

  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Dataset file not found on disk.' });
    return;
  }

  const downloadName =
    targetType === 'processed' ? `processed_${ds.filename}` : ds.filename;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.send(fs.readFileSync(filePath, 'utf-8'));
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const ds = db
    .prepare('SELECT id, uploaded_by, filename, raw_path, processed_path FROM datasets WHERE id = ?')
    .get(id) as
    | {
        id: number;
        uploaded_by: number | null;
        filename: string;
        raw_path: string | null;
        processed_path: string | null;
      }
    | undefined;

  if (!ds) {
    res.status(404).json({ error: 'Dataset not found.' });
    return;
  }

  if (req.user!.role !== 'Administrator' && ds.uploaded_by !== req.user!.id) {
    res.status(403).json({ error: 'Only administrators or the dataset uploader can delete this dataset.' });
    return;
  }

  db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
  logAudit({
    userId: req.user!.id,
    username: req.user!.username,
    action: 'DATASET_DELETED',
    resourceType: 'dataset',
    resourceId: id,
    details: `Deleted ${ds.filename}`,
  });

  res.json({ ok: true });
});

export default router;
