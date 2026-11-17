import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Papa from 'papaparse';
import { getDb } from '../db.ts';
import { analyzeSmiles } from './chemistry.ts';
import {
  ensureDataDirs,
  inspectDatasetCsv,
  preprocessDatasetCsv,
} from './preprocessing.ts';
import {
  splitRecords,
  trainAndEvaluateAlgorithm,
  predictWithArtifact,
  type AlgorithmName,
  type TrainedModelArtifact,
} from './ml.ts';
import { generatePredictionPdfBuffer } from './reports.ts';
import { hashPassword, logAudit } from './security.ts';

const SYNTHETIC_COMPOUND_LIBRARY = [
  { code: 'SYN-001', name: 'Erlotinib-Analog-A', smiles: 'COc1cc2ncnc(Nc3cccc(C#C)c3)c2cc1OCCOC', target: 'EGFR', assayType: 'Kinase Binding', org: 'Homo sapiens' },
  { code: 'SYN-002', name: 'Gefitinib-Core', smiles: 'COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1', target: 'EGFR', assayType: 'Kinase Binding', org: 'Homo sapiens' },
  { code: 'SYN-003', name: 'Imatinib-Scaffold', smiles: 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1', target: 'ABL1', assayType: 'Cell Viability', org: 'Homo sapiens' },
  { code: 'SYN-004', name: 'Sorafenib-Core', smiles: 'CNC(=O)c1cc(Oc2ccc(NC(=O)Nc3ccc(Cl)c(C(F)(F)F)c3)cc2)ccn1', target: 'VEGFR2', assayType: 'Kinase Binding', org: 'Homo sapiens' },
  { code: 'SYN-005', name: 'Sunitinib-Core', smiles: 'CCN(CC)CCNC(=O)c1c(C)[nH]c(/C=C2\\C(=O)Nc3ccc(F)cc32)c1C', target: 'VEGFR2', assayType: 'Cell Viability', org: 'Homo sapiens' },
  { code: 'SYN-006', name: 'Aspirin-Ref', smiles: 'CC(=O)Oc1ccccc1C(=O)O', target: 'PTGS2', assayType: 'Biochemical', org: 'Homo sapiens' },
  { code: 'SYN-007', name: 'Ibuprofen-Ref', smiles: 'CC(C)Cc1ccc(C(C)C(=O)O)cc1', target: 'PTGS2', assayType: 'Biochemical', org: 'Homo sapiens' },
  { code: 'SYN-008', name: 'Naproxen-Ref', smiles: 'COc1ccc2cc(C(C)C(=O)O)ccc2c1', target: 'PTGS2', assayType: 'Biochemical', org: 'Homo sapiens' },
  { code: 'SYN-009', name: 'Celecoxib-Core', smiles: 'Cc1ccc(-c2cc(C(F)(F)F)nn2-c2ccc(S(N)(=O)=O)cc2)cc1', target: 'PTGS2', assayType: 'Biochemical', org: 'Homo sapiens' },
  { code: 'SYN-010', name: 'Caffeine-Ref', smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', target: 'ADORA2A', assayType: 'Radioligand', org: 'Homo sapiens' },
  { code: 'SYN-011', name: 'Theophylline-Ref', smiles: 'Cn1c(=O)c2[nH]cnc2n(C)c1=O', target: 'ADORA2A', assayType: 'Radioligand', org: 'Homo sapiens' },
  { code: 'SYN-012', name: 'Acetaminophen-Ref', smiles: 'CC(=O)Nc1ccc(O)cc1', target: 'PTGS2', assayType: 'Biochemical', org: 'Mus musculus' },
  { code: 'SYN-013', name: 'Metformin-Ref', smiles: 'CN(C)C(=N)NC(=N)N', target: 'AMPK', assayType: 'Cell Viability', org: 'Mus musculus' },
  { code: 'SYN-014', name: 'Atorvastatin-Core', smiles: 'CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CCC(O)CC(O)CC(=O)O', target: 'HMGCR', assayType: 'Biochemical', org: 'Homo sapiens' },
  { code: 'SYN-015', name: 'Diazepam-Core', smiles: 'CN1C(=O)CN=C(c2ccccc2)c2cc(Cl)ccc21', target: 'GABRA1', assayType: 'Radioligand', org: 'Rattus norvegicus' },
  { code: 'SYN-016', name: 'Lorazepam-Core', smiles: 'OC1N=C(c2ccccc2Cl)c2cc(Cl)ccc2NC1=O', target: 'GABRA1', assayType: 'Radioligand', org: 'Rattus norvegicus' },
  { code: 'SYN-017', name: 'Fluoxetine-Core', smiles: 'CNCCC(Oc1ccc(C(F)(F)F)cc1)c1ccccc1', target: 'SLC6A4', assayType: 'Radioligand', org: 'Homo sapiens' },
  { code: 'SYN-018', name: 'Sertraline-Core', smiles: 'CNC1CCC(c2ccc(Cl)c(Cl)c2)c2ccccc12', target: 'SLC6A4', assayType: 'Radioligand', org: 'Homo sapiens' },
  { code: 'SYN-019', name: 'Omeprazole-Core', smiles: 'COc1ccc2[nH]c(S(=O)Cc3ncc(C)c(OC)c3C)nc2c1', target: 'ATP4A', assayType: 'Biochemical', org: 'Homo sapiens' },
  { code: 'SYN-020', name: 'Lapatinib-Core', smiles: 'CS(=O)(=O)CCNCc1ccc(-c2ccc3ncnc(Nc4ccc(OCc5cccc(F)c5)c(Cl)c4)c3c2)o1', target: 'EGFR', assayType: 'Kinase Binding', org: 'Homo sapiens' },
  { code: 'SYN-021', name: 'Quinazoline-Der-1', smiles: 'COc1cc2ncnc(Nc3ccc(Br)cc3)c2cc1OC', target: 'EGFR', assayType: 'Kinase Binding', org: 'Homo sapiens' },
  { code: 'SYN-022', name: 'Quinazoline-Der-2', smiles: 'COc1cc2ncnc(Nc3cccc(Cl)c3F)c2cc1OCCN1CCCC1', target: 'EGFR', assayType: 'Kinase Binding', org: 'Homo sapiens' },
  { code: 'SYN-023', name: 'Indolinone-Der-1', smiles: 'O=C1Nc2ccccc2/C1=C/c1ccc[nH]1', target: 'VEGFR2', assayType: 'Cell Viability', org: 'Homo sapiens' },
  { code: 'SYN-024', name: 'Indolinone-Der-2', smiles: 'Cc1[nH]c(/C=C2\\C(=O)Nc3ccc(Cl)cc32)c(C)c1C(=O)O', target: 'VEGFR2', assayType: 'Cell Viability', org: 'Mus musculus' },
  { code: 'SYN-025', name: 'Pyrazole-Der-1', smiles: 'Cc1nn(-c2ccccc2)c(C)c1C(=O)Nc1ccc(F)cc1', target: 'PTGS2', assayType: 'Biochemical', org: 'Homo sapiens' },
  { code: 'SYN-026', name: 'Pyrazole-Der-2', smiles: 'CCc1nn(-c2ccc(S(N)(=O)=O)cc2)cc1-c1ccc(OC)cc1', target: 'PTGS2', assayType: 'Biochemical', org: 'Mus musculus' },
  { code: 'SYN-027', name: 'Purine-Der-1', smiles: 'Nc1ncnc2c1ncn2C1OC(CO)C(O)C1O', target: 'ADORA2A', assayType: 'Radioligand', org: 'Homo sapiens' },
  { code: 'SYN-028', name: 'Purine-Der-2', smiles: 'CCn1cnc2c(NCc3ccccc3)ncnc21', target: 'ADORA2A', assayType: 'Radioligand', org: 'Rattus norvegicus' },
  { code: 'SYN-029', name: 'Sulfonamide-Der-1', smiles: 'NS(=O)(=O)c1ccc(NC(=O)c2ccccc2)cc1', target: 'CA2', assayType: 'Biochemical', org: 'Homo sapiens' },
  { code: 'SYN-030', name: 'Sulfonamide-Der-2', smiles: 'CC(=O)Nc1nnc(S(N)(=O)=O)s1', target: 'CA2', assayType: 'Biochemical', org: 'Homo sapiens' },
  { code: 'SYN-031', name: 'Benzimidazole-Der-1', smiles: 'Cc1nc2ccccc2[nH]1', target: 'ATP4A', assayType: 'Biochemical', org: 'Homo sapiens' },
  { code: 'SYN-032', name: 'Benzimidazole-Der-2', smiles: 'COc1ccc2nc(Cc3ncc(C)c(OC)c3C)[nH]c2c1', target: 'ATP4A', assayType: 'Cell Viability', org: 'Mus musculus' },
  { code: 'SYN-033', name: 'Coumarin-Der-1', smiles: 'O=c1ccc2ccccc2o1', target: 'MAOB', assayType: 'Biochemical', org: 'Homo sapiens' },
  { code: 'SYN-034', name: 'Coumarin-Der-2', smiles: 'CC(=O)c1c(O)c2ccccc2oc1=O', target: 'MAOB', assayType: 'Biochemical', org: 'Rattus norvegicus' },
  { code: 'SYN-035', name: 'Flavone-Der-1', smiles: 'O=c1cc(-c2ccccc2)oc2ccccc12', target: 'CYP1B1', assayType: 'Biochemical', org: 'Homo sapiens' },
  { code: 'SYN-036', name: 'Quercetin-Ref', smiles: 'O=c1c(O)c(-c2ccc(O)c(O)c2)oc2cc(O)cc(O)c12', target: 'CYP1B1', assayType: 'Cell Viability', org: 'Homo sapiens' },
  { code: 'SYN-037', name: 'Tamoxifen-Core', smiles: 'CC/C(=C(\\c1ccccc1)c1ccc(OCCN(C)C)cc1)c1ccccc1', target: 'ESR1', assayType: 'Cell Viability', org: 'Homo sapiens' },
  { code: 'SYN-038', name: 'Raloxifene-Core', smiles: 'O=C(c1ccc(OCCN2CCCCC2)cc1)c1c(-c2ccc(O)cc2)sc2cc(O)ccc12', target: 'ESR1', assayType: 'Radioligand', org: 'Homo sapiens' },
  { code: 'SYN-039', name: 'Propranolol-Ref', smiles: 'CC(C)NCC(O)COc1cccc2ccccc12', target: 'ADRB2', assayType: 'Radioligand', org: 'Homo sapiens' },
  { code: 'SYN-040', name: 'Atenolol-Ref', smiles: 'CC(C)NCC(O)COc1ccc(CC(N)=O)cc1', target: 'ADRB2', assayType: 'Radioligand', org: 'Mus musculus' },
];

function deterministicSyntheticPic50(
  mw: number,
  logp: number,
  tpsa: number,
  hbd: number,
  hba: number,
  rings: number,
  assayType: string,
  variantIdx: number
): number {
  // Smooth synthetic structure-activity formula so ML models learn genuine non-trivial signal
  const assayShift =
    assayType === 'Kinase Binding'
      ? 0.95
      : assayType === 'Radioligand'
        ? 0.45
        : assayType === 'Cell Viability'
          ? 0.15
          : -0.25;
  const noise = Math.sin(variantIdx * 12.9898) * 0.18;
  const raw =
    4.1 +
    0.42 * logp +
    0.0038 * mw -
    0.011 * tpsa +
    0.26 * rings +
    0.08 * hba -
    0.12 * hbd +
    assayShift +
    noise;
  return Number(Math.max(3.2, Math.min(9.6, raw)).toFixed(3));
}

export function generateSyntheticDemoCsv(sampleDir: string): string {
  const rows: Record<string, string | number>[] = [];
  let counter = 1;

  // Create 3 synthetic assay conditions per base scaffold -> 120 rows
  const variants = [
    { suffix: 'A', assaySuffix: '01', model: 'HeLa Cell Line', protocol: '72h luminescence synthetic benchmark', shift: 0.0 },
    { suffix: 'B', assaySuffix: '02', model: 'Purified Recombinant Enzyme', protocol: '30m biochemical synthetic benchmark', shift: 0.22 },
    { suffix: 'C', assaySuffix: '03', model: 'HEK293 Reporter', protocol: '24h reporter synthetic benchmark', shift: -0.18 },
  ];

  for (const base of SYNTHETIC_COMPOUND_LIBRARY) {
    const analyzed = analyzeSmiles(base.smiles);
    if (!analyzed.valid || !analyzed.descriptors) continue;
    const d = analyzed.descriptors;

    for (let vIdx = 0; vIdx < variants.length; vIdx++) {
      const v = variants[vIdx];
      const pic50 = Number(
        (
          deterministicSyntheticPic50(
            d.molecular_weight,
            d.logp,
            d.tpsa,
            d.hbd,
            d.hba,
            d.ring_count,
            base.assayType,
            counter
          ) + v.shift
        ).toFixed(3)
      );

      rows.push({
        record_id: `SYN_REC_${String(counter).padStart(4, '0')}`,
        compound_id: `${base.code}-${v.suffix}`,
        smiles: base.smiles,
        target_id: base.target,
        assay_id: `SYN_ASSAY_${base.target}_${v.assaySuffix}`,
        assay_type: base.assayType,
        organism_or_model: vIdx === 2 ? 'HEK293 Cell Line' : base.org,
        endpoint: 'pIC50',
        value: pic50,
        unit: 'log10_M',
        standard_value: pic50,
        relation: '=',
        protocol: v.protocol,
        source: 'SYNTHETIC_DEMO_DATASET',
      });
      counter++;
    }
  }

  const csvText = Papa.unparse(rows);
  const filePath = path.join(sampleDir, 'synthetic_demo_drug_response.csv');
  fs.writeFileSync(filePath, csvText, 'utf-8');
  return filePath;
}

export async function bootstrapInitialState(): Promise<void> {
  const db = getDb();
  const dirs = ensureDataDirs();

  // Always ensure synthetic demo CSV exists on disk
  const demoCsvPath = generateSyntheticDemoCsv(dirs.sampleDir);

  // Optional environment-provided admin bootstrap (never hardcoded password!)
  const envAdminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const envAdminPass = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (envAdminEmail && envAdminPass) {
    const existingAdmin = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(envAdminEmail);
    if (!existingAdmin) {
      db.prepare(
        `INSERT INTO users (username, email, password_hash, full_name, institution, role, is_demo)
         VALUES (?, ?, ?, ?, ?, 'Administrator', 0)`
      ).run(
        envAdminEmail.split('@')[0],
        envAdminEmail,
        hashPassword(envAdminPass),
        'Configured Administrator',
        'Research Systems Administration'
      );
    }
  }

  // Create demo researcher account for evaluation/exploration (non-admin)
  let demoUser = db
    .prepare('SELECT id, full_name FROM users WHERE username = ?')
    .get('demo_researcher') as { id: number; full_name: string } | undefined;

  if (!demoUser) {
    // Runtime-generated random password for demo user; Demo Sign-In button uses explicit demo endpoint when demo mode is enabled
    const runtimeSecret = crypto.randomBytes(24).toString('hex');
    const info = db
      .prepare(
        `INSERT INTO users (username, email, password_hash, full_name, institution, role, is_demo)
         VALUES (?, ?, ?, ?, ?, 'Researcher', 1)`
      )
      .run(
        'demo_researcher',
        'demo@drugefficacy.research',
        hashPassword(runtimeSecret),
        'Dr. Elena Vance (Demo Researcher)',
        'DrugEfficacy Insight Demonstration Sandbox'
      );
    demoUser = { id: Number(info.lastInsertRowid), full_name: 'Dr. Elena Vance (Demo Researcher)' };
  }

  // Ensure default project exists
  let defaultProject = db
    .prepare('SELECT id FROM projects WHERE is_demo = 1 LIMIT 1')
    .get() as { id: number } | undefined;
  if (!defaultProject) {
    const pInfo = db
      .prepare(
        `INSERT INTO projects (name, description, owner_id, is_demo)
         VALUES (?, ?, ?, 1)`
      )
      .run(
        'Synthetic Benchmark QSAR Study',
        'Clearly labeled synthetic demonstration project illustrating molecular descriptor extraction, scaffold splitting, and regression baselines.',
        demoUser.id
      );
    defaultProject = { id: Number(pInfo.lastInsertRowid) };
  }

  // Check if demo dataset already seeded
  const existingDataset = db
    .prepare('SELECT id FROM datasets WHERE is_synthetic_demo = 1 LIMIT 1')
    .get() as { id: number } | undefined;

  if (!existingDataset) {
    const csvText = fs.readFileSync(demoCsvPath, 'utf-8');
    const diag = inspectDatasetCsv(csvText);
    const prep = preprocessDatasetCsv(csvText, 'pIC50', 'log10_M');

    const processedPath = path.join(dirs.processedDir, 'synthetic_demo_processed.csv');
    fs.writeFileSync(processedPath, prep.processed_csv, 'utf-8');

    const dsInfo = db
      .prepare(
        `INSERT INTO datasets (
          name, filename, project_id, uploaded_by, is_synthetic_demo,
          row_count, col_count, valid_row_count, missing_count, duplicate_count,
          endpoint, unit, schema_valid, status, raw_path, processed_path, stats_json, validation_notes
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 1, 'preprocessed', ?, ?, ?, ?)`
      )
      .run(
        'Synthetic Demo Drug Response (pIC50)',
        'synthetic_demo_drug_response.csv',
        defaultProject.id,
        demoUser.id,
        diag.row_count,
        diag.col_count,
        prep.cleaned.length,
        diag.total_missing_cells,
        diag.duplicate_count,
        prep.endpoint,
        prep.unit,
        demoCsvPath,
        processedPath,
        JSON.stringify(diag),
        'Synthetic demonstration dataset generated for research prototype testing. Values are computational synthetic estimates, not wet-lab observations.'
      );
    const datasetId = Number(dsInfo.lastInsertRowid);

    // Insert compounds, assays, and measurements
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

    const compoundMap = new Map<string, number>();
    const assayMap = new Map<string, number>();

    for (const rec of prep.cleaned) {
      let compId = compoundMap.get(rec.canonical_smiles);
      if (!compId) {
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
          demoUser.id
        );
        compId = Number(cRes.lastInsertRowid);
        compoundMap.set(rec.canonical_smiles, compId);
      }

      let assayId = assayMap.get(rec.assay_id);
      if (!assayId) {
        const aRes = insertAssay.run(
          rec.assay_id,
          rec.assay_type,
          rec.target_id,
          'In vitro synthetic benchmark',
          rec.organism_or_model,
          rec.endpoint,
          rec.unit,
          rec.protocol
        );
        assayId = Number(aRes.lastInsertRowid);
        assayMap.set(rec.assay_id, assayId);
      }

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

    // Train all 4 ML models on the synthetic demo dataset using scaffold split
    const split = splitRecords(prep.cleaned, 'scaffold', 0.2, 42);
    const algorithms: { key: AlgorithmName; label: string }[] = [
      { key: 'dummy_regressor', label: 'Dummy Mean Baseline' },
      { key: 'ridge_regression', label: 'Ridge Regression (L2)' },
      { key: 'random_forest', label: 'Random Forest Regressor' },
      { key: 'gradient_boosting', label: 'Gradient Boosting Regressor' },
    ];

    let bestModelId = 0;
    let bestR2 = -Infinity;
    let bestArtifact: TrainedModelArtifact | null = null;
    let bestModelMeta: { name: string; algorithm: string; version: string } | null = null;

    for (const algo of algorithms) {
      const version = 'v1.0-demo';
      const { artifact, artifactPath } = trainAndEvaluateAlgorithm({
        trainRecords: split.train,
        testRecords: split.test,
        algorithm: algo.key,
        version,
        targetEndpoint: prep.endpoint,
        targetUnit: prep.unit,
        splitMethod: split.effectiveMethod,
        modelsDir: dirs.modelsDir,
      });

      const mRes = db
        .prepare(
          `INSERT INTO models (
            name, algorithm, version, dataset_id, target_endpoint, target_unit,
            split_method, mae, rmse, r2, train_samples, test_samples,
            feature_names_json, feature_importance_json, evaluation_plot_json,
            artifact_path, is_active, is_demo, status, trained_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 'trained', ?)`
        )
        .run(
          `${algo.label} (Synthetic Demo)`,
          algo.key,
          version,
          datasetId,
          prep.endpoint,
          prep.unit,
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
          demoUser.id
        );
      const modelId = Number(mRes.lastInsertRowid);
      if (artifact.metrics.r2 > bestR2 && algo.key !== 'dummy_regressor') {
        bestR2 = artifact.metrics.r2;
        bestModelId = modelId;
        bestArtifact = artifact;
        bestModelMeta = {
          name: `${algo.label} (Synthetic Demo)`,
          algorithm: algo.key,
          version,
        };
      }
    }

    if (bestModelId > 0) {
      db.prepare('UPDATE models SET is_active = 1 WHERE id = ?').run(bestModelId);
    }

    // Create 3 initial demonstration predictions and sample PDF report
    if (bestArtifact && bestModelMeta && bestModelId > 0) {
      const demoQueries = [
        {
          code: 'PRED-DEMO-0001',
          name: 'Erlotinib (Reference EGFR Inhibitor)',
          smiles: 'COc1cc2ncnc(Nc3cccc(C#C)c3)c2cc1OCCOC',
          assay_type: 'Kinase Binding',
          target_name: 'EGFR',
          biological_model: 'A431 Cell Line',
          organism: 'Homo sapiens',
          exposure: '72 hours',
        },
        {
          code: 'PRED-DEMO-0002',
          name: 'Aspirin (Acetylsalicylic Acid)',
          smiles: 'CC(=O)Oc1ccccc1C(=O)O',
          assay_type: 'Biochemical',
          target_name: 'PTGS2',
          biological_model: 'Purified COX-2 Enzyme',
          organism: 'Homo sapiens',
          exposure: '30 minutes',
        },
        {
          code: 'PRED-DEMO-0003',
          name: 'Imatinib (BCR-ABL Reference)',
          smiles: 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1',
          assay_type: 'Cell Viability',
          target_name: 'ABL1',
          biological_model: 'K562 Cell Line',
          organism: 'Homo sapiens',
          exposure: '48 hours',
        },
      ];

      let samplePdfWritten = false;
      for (const q of demoQueries) {
        const smi = analyzeSmiles(q.smiles);
        if (!smi.valid || !smi.descriptors) continue;
        const d = smi.descriptors;

        const cRes = db
          .prepare(
            `INSERT INTO compounds (
              compound_code, name, original_smiles, canonical_smiles, molecular_formula,
              molecular_weight, logp, tpsa, hbd, hba, rotatable_bonds, ring_count, heavy_atoms, scaffold_smiles, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            q.code,
            q.name,
            d.original_smiles,
            d.canonical_smiles,
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
            demoUser.id
          );
        const compId = Number(cRes.lastInsertRowid);

        const aRes = db
          .prepare(
            `INSERT INTO assays (assay_code, assay_type, target_name, biological_model, organism, endpoint, unit, exposure_duration)
             VALUES (?, ?, ?, ?, ?, 'pIC50', 'log10_M', ?)`
          )
          .run(q.code, q.assay_type, q.target_name, q.biological_model, q.organism, q.exposure);
        const assayId = Number(aRes.lastInsertRowid);

        const pred = predictWithArtifact(bestArtifact, d, {
          assay_type: q.assay_type,
          organism_or_model: q.organism,
        });

        db.prepare(
          `INSERT INTO predictions (
            prediction_code, user_id, compound_id, assay_id, model_id,
            predicted_value, predicted_unit, in_domain, domain_distance, applicability_warning,
            descriptors_json, context_json, is_demo
          ) VALUES (?, ?, ?, ?, ?, ?, 'log10_M', ?, ?, ?, ?, ?, 1)`
        ).run(
          q.code,
          demoUser.id,
          compId,
          assayId,
          bestModelId,
          pred.predicted_value,
          pred.in_domain ? 1 : 0,
          pred.domain_distance,
          pred.applicability_warning,
          JSON.stringify({
            molecular_weight: d.molecular_weight,
            logp: d.logp,
            tpsa: d.tpsa,
            hbd: d.hbd,
            hba: d.hba,
            rotatable_bonds: d.rotatable_bonds,
            ring_count: d.ring_count,
            heavy_atoms: d.heavy_atoms,
            lipinski_violations: d.lipinski_violations,
          }),
          JSON.stringify({
            assay_type: q.assay_type,
            target_name: q.target_name,
            biological_model: q.biological_model,
            organism: q.organism,
            endpoint: 'pIC50',
            exposure_duration: q.exposure,
          })
        );

        if (!samplePdfWritten) {
          const pdfBuf = generatePredictionPdfBuffer({
            prediction_code: q.code,
            created_at: new Date().toISOString(),
            researcher_name: demoUser.full_name,
            compound_name: q.name,
            original_smiles: d.original_smiles,
            canonical_smiles: d.canonical_smiles,
            molecular_formula: d.molecular_formula,
            descriptors: d,
            context: {
              assay_type: q.assay_type,
              target_name: q.target_name,
              biological_model: q.biological_model,
              organism: q.organism,
              endpoint: 'pIC50',
              exposure_duration: q.exposure,
            },
            model: {
              name: bestModelMeta.name,
              algorithm: bestModelMeta.algorithm,
              version: bestModelMeta.version,
              split_method: bestArtifact.split_method,
              mae: bestArtifact.metrics.mae,
              rmse: bestArtifact.metrics.rmse,
              r2: bestArtifact.metrics.r2,
              is_demo: true,
            },
            predicted_value: pred.predicted_value,
            predicted_unit: 'log10_M',
            in_domain: pred.in_domain,
            domain_distance: pred.domain_distance,
            applicability_warning: pred.applicability_warning,
            is_demo: true,
          });
          fs.writeFileSync(path.join(dirs.reportsDir, 'sample_prediction_report.pdf'), pdfBuf);
          samplePdfWritten = true;
        }
      }
    }

    logAudit({
      userId: demoUser.id,
      username: 'system',
      action: 'DEMO_BOOTSTRAP',
      resourceType: 'system',
      details: 'Initialized SQLite schema, synthetic demonstration dataset, and baseline ML models.',
    });
  }
}
