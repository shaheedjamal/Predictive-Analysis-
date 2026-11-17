import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { analyzeSmiles } from './chemistry.ts';

export const REQUIRED_DATASET_COLUMNS = [
  'record_id',
  'compound_id',
  'smiles',
  'target_id',
  'assay_id',
  'assay_type',
  'organism_or_model',
  'endpoint',
  'value',
  'unit',
  'standard_value',
  'relation',
  'protocol',
  'source',
] as const;

export interface DatasetDiagnostics {
  row_count: number;
  col_count: number;
  columns: string[];
  missing_columns: string[];
  missing_by_column: Record<string, number>;
  total_missing_cells: number;
  duplicate_count: number;
  invalid_smiles_count: number;
  invalid_numeric_count: number;
  endpoints: Record<string, number>;
  units: Record<string, number>;
  assay_types: Record<string, number>;
  endpoint_unit_compatible: boolean;
  compatibility_warning: string | null;
  target_stats: {
    count: number;
    min: number;
    max: number;
    mean: number;
    std: number;
    median: number;
  } | null;
  preview_rows: Record<string, string>[];
}

export interface CleanedRecord {
  record_id: string;
  compound_id: string;
  original_smiles: string;
  canonical_smiles: string;
  scaffold_smiles: string;
  target_id: string;
  assay_id: string;
  assay_type: string;
  organism_or_model: string;
  endpoint: string;
  value: number;
  unit: string;
  standard_value: number;
  relation: string;
  protocol: string;
  source: string;
  molecular_weight: number;
  logp: number;
  tpsa: number;
  hbd: number;
  hba: number;
  rotatable_bonds: number;
  ring_count: number;
  heavy_atoms: number;
  aromatic_atoms: number;
}

export interface PreprocessResult {
  cleaned: CleanedRecord[];
  dropped_rows: { row_index: number; record_id: string; reason: string }[];
  endpoint: string;
  unit: string;
  processed_csv: string;
}

export function parseCsvContent(csvText: string): {
  columns: string[];
  rows: Record<string, string>[];
  errors: string[];
} {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const columns = parsed.meta.fields ?? [];
  const errors = parsed.errors.map((e) => `Row ${e.row ?? '?'}: ${e.message}`);
  return { columns, rows: parsed.data, errors };
}

export function inspectDatasetCsv(csvText: string): DatasetDiagnostics {
  const { columns, rows } = parseCsvContent(csvText);

  const missingColumns = REQUIRED_DATASET_COLUMNS.filter((col) => !columns.includes(col));

  const missingByColumn: Record<string, number> = {};
  for (const col of columns) {
    missingByColumn[col] = 0;
  }

  let totalMissingCells = 0;
  const seenKeys = new Set<string>();
  let duplicateCount = 0;
  let invalidSmilesCount = 0;
  let invalidNumericCount = 0;

  const endpoints: Record<string, number> = {};
  const units: Record<string, number> = {};
  const assayTypes: Record<string, number> = {};
  const numericValues: number[] = [];

  for (const row of rows) {
    for (const col of columns) {
      const val = row[col];
      if (val === undefined || val === null || String(val).trim() === '') {
        missingByColumn[col] = (missingByColumn[col] || 0) + 1;
        totalMissingCells++;
      }
    }

    const recId = (row.record_id || '').trim();
    const smiles = (row.smiles || '').trim();
    const assayId = (row.assay_id || '').trim();
    const dedupKey = recId ? `id:${recId}` : `sa:${smiles}|${assayId}`;
    if (seenKeys.has(dedupKey)) {
      duplicateCount++;
    } else {
      seenKeys.add(dedupKey);
    }

    if (smiles) {
      const check = analyzeSmiles(smiles);
      if (!check.valid) invalidSmilesCount++;
    }

    const rawStd = (row.standard_value ?? row.value ?? '').trim();
    const num = Number(rawStd);
    if (rawStd === '' || !Number.isFinite(num)) {
      invalidNumericCount++;
    } else {
      numericValues.push(num);
    }

    const ep = (row.endpoint || 'Unspecified').trim();
    const unit = (row.unit || 'Unspecified').trim();
    const at = (row.assay_type || 'Unspecified').trim();
    endpoints[ep] = (endpoints[ep] || 0) + 1;
    units[unit] = (units[unit] || 0) + 1;
    assayTypes[at] = (assayTypes[at] || 0) + 1;
  }

  const endpointKeys = Object.keys(endpoints).filter((k) => k !== 'Unspecified');
  const unitKeys = Object.keys(units).filter((k) => k !== 'Unspecified');
  const compatible = endpointKeys.length <= 1 && unitKeys.length <= 1;

  let compatibilityWarning: string | null = null;
  if (!compatible) {
    compatibilityWarning = `Dataset mixes ${endpointKeys.length} endpoints (${endpointKeys.join(', ')}) and ${unitKeys.length} units (${unitKeys.join(', ')}). Preprocessing requires selecting or isolating a single consistent endpoint and unit.`;
  }

  let targetStats: DatasetDiagnostics['target_stats'] = null;
  if (numericValues.length > 0) {
    const sorted = [...numericValues].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const mean = sum / sorted.length;
    const variance =
      sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / sorted.length;
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

    targetStats = {
      count: sorted.length,
      min: Number(sorted[0].toFixed(4)),
      max: Number(sorted[sorted.length - 1].toFixed(4)),
      mean: Number(mean.toFixed(4)),
      std: Number(Math.sqrt(variance).toFixed(4)),
      median: Number(median.toFixed(4)),
    };
  }

  return {
    row_count: rows.length,
    col_count: columns.length,
    columns,
    missing_columns: missingColumns,
    missing_by_column: missingByColumn,
    total_missing_cells: totalMissingCells,
    duplicate_count: duplicateCount,
    invalid_smiles_count: invalidSmilesCount,
    invalid_numeric_count: invalidNumericCount,
    endpoints,
    units,
    assay_types: assayTypes,
    endpoint_unit_compatible: compatible,
    compatibility_warning: compatibilityWarning,
    target_stats: targetStats,
    preview_rows: rows.slice(0, 25),
  };
}

export function preprocessDatasetCsv(
  csvText: string,
  targetEndpoint?: string,
  targetUnit?: string
): PreprocessResult {
  const { columns, rows } = parseCsvContent(csvText);

  const missingColumns = REQUIRED_DATASET_COLUMNS.filter((col) => !columns.includes(col));
  if (missingColumns.length > 0) {
    throw new Error(
      `Cannot preprocess dataset: missing required schema columns: ${missingColumns.join(', ')}`
    );
  }

  // Determine dominant endpoint & unit if not explicitly specified, or enforce homogeneity
  const endpointCounts: Record<string, number> = {};
  const unitCounts: Record<string, number> = {};
  for (const r of rows) {
    const ep = (r.endpoint || '').trim();
    const u = (r.unit || '').trim();
    if (ep) endpointCounts[ep] = (endpointCounts[ep] || 0) + 1;
    if (u) unitCounts[u] = (unitCounts[u] || 0) + 1;
  }

  const chosenEndpoint =
    targetEndpoint ||
    Object.entries(endpointCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    'pIC50';
  const chosenUnit =
    targetUnit ||
    Object.entries(unitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    'log10_M';

  // Refuse silent mixing if no explicit filter was requested and multiple units/endpoints exist
  if (
    !targetEndpoint &&
    Object.keys(endpointCounts).length > 1
  ) {
    throw new Error(
      `Incompatible endpoints detected (${Object.keys(endpointCounts).join(', ')}). Specify a target endpoint to filter consistently without combining incompatible measurements.`
    );
  }
  if (
    !targetUnit &&
    Object.keys(unitCounts).length > 1
  ) {
    throw new Error(
      `Incompatible measurement units detected (${Object.keys(unitCounts).join(', ')}). Specify a target unit to avoid combining incompatible measurements.`
    );
  }

  const cleaned: CleanedRecord[] = [];
  const droppedRows: { row_index: number; record_id: string; reason: string }[] = [];
  const seenRecordIds = new Set<string>();
  const seenCanonicalAssay = new Set<string>();

  rows.forEach((row, idx) => {
    const recId = (row.record_id || `ROW_${idx + 1}`).trim();
    const rowEndpoint = (row.endpoint || '').trim();
    const rowUnit = (row.unit || '').trim();

    if (rowEndpoint !== chosenEndpoint || rowUnit !== chosenUnit) {
      droppedRows.push({
        row_index: idx + 1,
        record_id: recId,
        reason: `Incompatible endpoint/unit (${rowEndpoint || 'empty'} / ${rowUnit || 'empty'} != ${chosenEndpoint} / ${chosenUnit})`,
      });
      return;
    }

    if (seenRecordIds.has(recId)) {
      droppedRows.push({
        row_index: idx + 1,
        record_id: recId,
        reason: 'Duplicate record_id',
      });
      return;
    }

    const rawSmiles = (row.smiles || '').trim();
    const smiResult = analyzeSmiles(rawSmiles);
    if (!smiResult.valid || !smiResult.descriptors) {
      droppedRows.push({
        row_index: idx + 1,
        record_id: recId,
        reason: smiResult.error || 'Invalid SMILES',
      });
      return;
    }

    const assayId = (row.assay_id || 'ASSAY_DEFAULT').trim();
    const canonicalAssayKey = `${smiResult.descriptors.canonical_smiles}||${assayId}`;
    if (seenCanonicalAssay.has(canonicalAssayKey)) {
      droppedRows.push({
        row_index: idx + 1,
        record_id: recId,
        reason: 'Duplicate canonical SMILES + assay_id measurement',
      });
      return;
    }

    const rawVal = Number((row.value ?? '').trim());
    const stdVal = Number((row.standard_value ?? row.value ?? '').trim());
    if (!Number.isFinite(stdVal)) {
      droppedRows.push({
        row_index: idx + 1,
        record_id: recId,
        reason: 'Missing or non-numeric standard_value',
      });
      return;
    }

    seenRecordIds.add(recId);
    seenCanonicalAssay.add(canonicalAssayKey);

    cleaned.push({
      record_id: recId,
      compound_id: (row.compound_id || `CMPD_${idx + 1}`).trim(),
      original_smiles: rawSmiles,
      canonical_smiles: smiResult.descriptors.canonical_smiles,
      scaffold_smiles: smiResult.descriptors.scaffold_smiles,
      target_id: (row.target_id || 'UNSPECIFIED_TARGET').trim(),
      assay_id: assayId,
      assay_type: (row.assay_type || 'Biochemical').trim(),
      organism_or_model: (row.organism_or_model || 'Homo sapiens').trim(),
      endpoint: chosenEndpoint,
      value: Number.isFinite(rawVal) ? rawVal : stdVal,
      unit: chosenUnit,
      standard_value: stdVal,
      relation: (row.relation || '=').trim(),
      protocol: (row.protocol || 'Standard assay protocol').trim(),
      source: (row.source || 'Uploaded CSV').trim(),
      molecular_weight: smiResult.descriptors.molecular_weight,
      logp: smiResult.descriptors.logp,
      tpsa: smiResult.descriptors.tpsa,
      hbd: smiResult.descriptors.hbd,
      hba: smiResult.descriptors.hba,
      rotatable_bonds: smiResult.descriptors.rotatable_bonds,
      ring_count: smiResult.descriptors.ring_count,
      heavy_atoms: smiResult.descriptors.heavy_atoms,
      aromatic_atoms: smiResult.descriptors.aromatic_atoms,
    });
  });

  const processedCsv = Papa.unparse(cleaned);
  return {
    cleaned,
    dropped_rows: droppedRows,
    endpoint: chosenEndpoint,
    unit: chosenUnit,
    processed_csv: processedCsv,
  };
}

export function ensureDataDirs(): {
  sampleDir: string;
  uploadsDir: string;
  processedDir: string;
  modelsDir: string;
  reportsDir: string;
} {
  const root = process.cwd();
  const dirs = {
    sampleDir: path.join(root, 'data', 'sample'),
    uploadsDir: path.join(root, 'data', 'uploads'),
    processedDir: path.join(root, 'data', 'processed'),
    modelsDir: path.join(root, 'models'),
    reportsDir: path.join(root, 'reports'),
  };
  for (const dir of Object.values(dirs)) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  return dirs;
}
