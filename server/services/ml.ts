import fs from 'node:fs';
import path from 'node:path';
import type { CleanedRecord } from './preprocessing.ts';
import type { MolecularDescriptors } from './chemistry.ts';

export type AlgorithmName =
  | 'dummy_regressor'
  | 'ridge_regression'
  | 'random_forest'
  | 'gradient_boosting';

export type SplitMethod = 'scaffold' | 'group' | 'random_exploratory';

export interface PreprocessorState {
  numericFeatures: string[];
  medians: number[];
  means: number[];
  stds: number[];
  assayTypes: string[];
  organisms: string[];
  featureNames: string[];
  featureMins: number[];
  featureMaxs: number[];
}

export interface TrainedModelArtifact {
  algorithm: AlgorithmName;
  version: string;
  target_endpoint: string;
  target_unit: string;
  split_method: SplitMethod;
  preprocessor: PreprocessorState;
  weights?: number[]; // Ridge
  bias?: number; // Ridge or Dummy or GBR base
  trees?: SerializedTree[]; // RF or GBR
  learning_rate?: number; // GBR
  metrics: {
    mae: number;
    rmse: number;
    r2: number;
    train_samples: number;
    test_samples: number;
  };
  feature_importance: { feature: string; importance: number }[];
  evaluation_plot: {
    actual_vs_predicted: { actual: number; predicted: number; record_id: string }[];
    residuals_histogram: { bin: string; count: number }[];
  };
}

interface TreeNode {
  isLeaf: boolean;
  value?: number;
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

type SerializedTree = TreeNode;

const NUMERIC_DESCRIPTOR_KEYS = [
  'molecular_weight',
  'logp',
  'tpsa',
  'hbd',
  'hba',
  'rotatable_bonds',
  'ring_count',
  'heavy_atoms',
  'aromatic_atoms',
] as const;

class SeededRng {
  private state: number;
  constructor(seed = 42) {
    this.state = seed >>> 0;
  }
  next(): number {
    // Mulberry32 deterministic PRNG for reproducible splits & forests
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export function splitRecords(
  records: CleanedRecord[],
  method: SplitMethod,
  testRatio = 0.2,
  seed = 42
): { train: CleanedRecord[]; test: CleanedRecord[]; effectiveMethod: SplitMethod } {
  const rng = new SeededRng(seed);

  if (method === 'random_exploratory') {
    const shuffled = [...records];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const testSize = Math.max(2, Math.round(shuffled.length * testRatio));
    return {
      train: shuffled.slice(testSize),
      test: shuffled.slice(0, testSize),
      effectiveMethod: 'random_exploratory',
    };
  }

  // Group by scaffold_smiles or target/assay group
  const groups = new Map<string, CleanedRecord[]>();
  for (const r of records) {
    const key =
      method === 'scaffold'
        ? r.scaffold_smiles || 'ACYCLIC'
        : `${r.target_id}::${r.assay_id}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  // Fallback check: if there is only 1 group total, warn/fallback to exploratory random split
  if (groups.size < 2) {
    return splitRecords(records, 'random_exploratory', testRatio, seed);
  }

  // Sort groups deterministically, then shuffle slightly with seed and allocate smallest/medium groups to test until ~testRatio
  const groupEntries = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  const targetTestCount = Math.max(2, Math.round(records.length * testRatio));
  const train: CleanedRecord[] = [];
  const test: CleanedRecord[] = [];

  // Put largest scaffold cores in train, allocate interleaved groups to test so test never gets empty
  const indices = groupEntries.map((_, i) => i);
  for (let i = indices.length - 1; i > 1; i--) {
    const j = 1 + Math.floor(rng.next() * i);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  for (const idx of indices) {
    const [, grp] = groupEntries[idx];
    if (test.length < targetTestCount && train.length >= grp.length) {
      test.push(...grp);
    } else {
      train.push(...grp);
    }
  }

  if (test.length === 0 && train.length > 2) {
    const moved = train.splice(-Math.max(2, Math.floor(records.length * testRatio)));
    test.push(...moved);
  }

  return { train, test, effectiveMethod: method };
}

function fitPreprocessor(trainRecords: CleanedRecord[]): PreprocessorState {
  const assaySet = new Set<string>();
  const orgSet = new Set<string>();
  for (const r of trainRecords) {
    assaySet.add(r.assay_type);
    orgSet.add(r.organism_or_model);
  }
  const assayTypes = Array.from(assaySet).sort();
  const organisms = Array.from(orgSet).sort();

  const numCount = NUMERIC_DESCRIPTOR_KEYS.length;
  const medians: number[] = [];
  const means: number[] = [];
  const stds: number[] = [];
  const mins: number[] = [];
  const maxs: number[] = [];

  for (let j = 0; j < numCount; j++) {
    const key = NUMERIC_DESCRIPTOR_KEYS[j];
    const vals = trainRecords
      .map((r) => Number(r[key]))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);

    const med =
      vals.length === 0
        ? 0
        : vals.length % 2 === 0
          ? (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2
          : vals[Math.floor(vals.length / 2)];
    medians.push(med);

    const filled = trainRecords.map((r) => {
      const v = Number(r[key]);
      return Number.isFinite(v) ? v : med;
    });
    const mean = filled.reduce((s, v) => s + v, 0) / Math.max(1, filled.length);
    const variance =
      filled.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, filled.length);
    const std = Math.sqrt(variance) || 1;
    means.push(mean);
    stds.push(std);
    mins.push(vals.length ? vals[0] : 0);
    maxs.push(vals.length ? vals[vals.length - 1] : 0);
  }

  const featureNames: string[] = [
    ...NUMERIC_DESCRIPTOR_KEYS,
    ...assayTypes.map((a) => `assay:${a}`),
    ...organisms.map((o) => `org:${o}`),
  ];

  return {
    numericFeatures: [...NUMERIC_DESCRIPTOR_KEYS],
    medians,
    means,
    stds,
    assayTypes,
    organisms,
    featureNames,
    featureMins: mins,
    featureMaxs: maxs,
  };
}

function transformRecord(
  rec: {
    molecular_weight: number;
    logp: number;
    tpsa: number;
    hbd: number;
    hba: number;
    rotatable_bonds: number;
    ring_count: number;
    heavy_atoms: number;
    aromatic_atoms: number;
    assay_type: string;
    organism_or_model: string;
  },
  prep: PreprocessorState
): number[] {
  const vec: number[] = [];
  for (let j = 0; j < NUMERIC_DESCRIPTOR_KEYS.length; j++) {
    const key = NUMERIC_DESCRIPTOR_KEYS[j];
    const raw = Number(rec[key]);
    const val = Number.isFinite(raw) ? raw : prep.medians[j];
    vec.push((val - prep.means[j]) / (prep.stds[j] || 1));
  }
  for (const a of prep.assayTypes) {
    vec.push(rec.assay_type === a ? 1 : 0);
  }
  for (const o of prep.organisms) {
    vec.push(rec.organism_or_model === o ? 1 : 0);
  }
  return vec;
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > maxVal) {
        maxVal = Math.abs(aug[r][col]);
        pivotRow = r;
      }
    }
    if (pivotRow !== col) {
      [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
    }
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) {
      aug[col][col] = 1e-10;
    }
    const div = aug[col][col];
    for (let j = col; j <= n; j++) {
      aug[col][j] /= div;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) {
        aug[r][j] -= factor * aug[col][j];
      }
    }
  }
  return aug.map((row) => row[n]);
}

function trainRidge(
  X: number[][],
  y: number[],
  alpha = 1.0
): { weights: number[]; bias: number } {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const yMean = y.reduce((s, v) => s + v, 0) / Math.max(1, n);
  const yCentered = y.map((v) => v - yMean);

  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty: number[] = Array(p).fill(0);

  for (let i = 0; i < n; i++) {
    const xi = X[i];
    const yi = yCentered[i];
    for (let j = 0; j < p; j++) {
      Xty[j] += xi[j] * yi;
      for (let k = j; k < p; k++) {
        XtX[j][k] += xi[j] * xi[k];
      }
    }
  }

  for (let j = 0; j < p; j++) {
    XtX[j][j] += alpha;
    for (let k = 0; k < j; k++) {
      XtX[j][k] = XtX[k][j];
    }
  }

  const weights = p > 0 ? solveLinearSystem(XtX, Xty) : [];
  return { weights, bias: yMean };
}

function buildCartTree(
  X: number[][],
  y: number[],
  indices: number[],
  depth: number,
  maxDepth: number,
  minSamplesSplit: number,
  featureSubsetSize: number,
  rng: SeededRng,
  importances: number[]
): TreeNode {
  const n = indices.length;
  let sum = 0;
  for (const idx of indices) sum += y[idx];
  const mean = sum / Math.max(1, n);

  if (depth >= maxDepth || n < minSamplesSplit) {
    return { isLeaf: true, value: mean };
  }

  let totalSqErr = 0;
  for (const idx of indices) {
    const d = y[idx] - mean;
    totalSqErr += d * d;
  }
  if (totalSqErr < 1e-9) {
    return { isLeaf: true, value: mean };
  }

  const p = X[0].length;
  const allFeatures = Array.from({ length: p }, (_, i) => i);
  if (featureSubsetSize < p) {
    for (let i = allFeatures.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [allFeatures[i], allFeatures[j]] = [allFeatures[j], allFeatures[i]];
    }
  }
  const candidateFeatures = allFeatures.slice(0, featureSubsetSize);

  let bestGain = 0;
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestLeft: number[] = [];
  let bestRight: number[] = [];

  for (const feat of candidateFeatures) {
    // Sort indices by feature value
    const sorted = [...indices].sort((a, b) => X[a][feat] - X[b][feat]);
    let leftSum = 0;
    let leftSqSum = 0;
    let rightSum = sum;
    let rightSqSum = 0;
    for (const idx of sorted) rightSqSum += y[idx] * y[idx];

    for (let i = 0; i < n - 1; i++) {
      const idx = sorted[i];
      const nextIdx = sorted[i + 1];
      const val = y[idx];
      leftSum += val;
      leftSqSum += val * val;
      rightSum -= val;
      rightSqSum -= val * val;

      if (Math.abs(X[idx][feat] - X[nextIdx][feat]) < 1e-9) continue;

      const leftCount = i + 1;
      const rightCount = n - leftCount;
      const leftErr = leftSqSum - (leftSum * leftSum) / leftCount;
      const rightErr = rightSqSum - (rightSum * rightSum) / rightCount;
      const gain = totalSqErr - (leftErr + rightErr);

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = feat;
        bestThreshold = (X[idx][feat] + X[nextIdx][feat]) / 2;
      }
    }
  }

  if (bestFeature === -1 || bestGain <= 1e-8) {
    return { isLeaf: true, value: mean };
  }

  importances[bestFeature] += bestGain;

  bestLeft = [];
  bestRight = [];
  for (const idx of indices) {
    if (X[idx][bestFeature] <= bestThreshold) {
      bestLeft.push(idx);
    } else {
      bestRight.push(idx);
    }
  }

  if (bestLeft.length === 0 || bestRight.length === 0) {
    return { isLeaf: true, value: mean };
  }

  return {
    isLeaf: false,
    featureIndex: bestFeature,
    threshold: bestThreshold,
    left: buildCartTree(
      X,
      y,
      bestLeft,
      depth + 1,
      maxDepth,
      minSamplesSplit,
      featureSubsetSize,
      rng,
      importances
    ),
    right: buildCartTree(
      X,
      y,
      bestRight,
      depth + 1,
      maxDepth,
      minSamplesSplit,
      featureSubsetSize,
      rng,
      importances
    ),
  };
}

function predictTree(node: TreeNode, x: number[]): number {
  let curr = node;
  while (!curr.isLeaf) {
    if (x[curr.featureIndex!] <= curr.threshold!) {
      curr = curr.left!;
    } else {
      curr = curr.right!;
    }
  }
  return curr.value ?? 0;
}

function computeMetrics(actual: number[], predicted: number[]): {
  mae: number;
  rmse: number;
  r2: number;
} {
  const n = actual.length;
  if (n === 0) return { mae: 0, rmse: 0, r2: 0 };

  let absSum = 0;
  let sqSum = 0;
  const meanY = actual.reduce((s, v) => s + v, 0) / n;
  let tss = 0;

  for (let i = 0; i < n; i++) {
    const err = actual[i] - predicted[i];
    absSum += Math.abs(err);
    sqSum += err * err;
    tss += (actual[i] - meanY) ** 2;
  }

  const mae = absSum / n;
  const rmse = Math.sqrt(sqSum / n);
  const r2 = tss > 1e-12 ? 1 - sqSum / tss : 0;

  return {
    mae: Number(mae.toFixed(4)),
    rmse: Number(rmse.toFixed(4)),
    r2: Number(r2.toFixed(4)),
  };
}

function buildResidualHistogram(residuals: number[]): { bin: string; count: number }[] {
  if (residuals.length === 0) return [];
  const min = Math.min(...residuals);
  const max = Math.max(...residuals);
  const binsCount = 7;
  const span = max - min || 1;
  const width = span / binsCount;
  const counts = Array(binsCount).fill(0);

  for (const r of residuals) {
    let idx = Math.floor((r - min) / width);
    if (idx >= binsCount) idx = binsCount - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }

  return counts.map((count, i) => {
    const lo = (min + i * width).toFixed(2);
    const hi = (min + (i + 1) * width).toFixed(2);
    return { bin: `${lo}..${hi}`, count };
  });
}

export function trainAndEvaluateAlgorithm(params: {
  trainRecords: CleanedRecord[];
  testRecords: CleanedRecord[];
  algorithm: AlgorithmName;
  version: string;
  targetEndpoint: string;
  targetUnit: string;
  splitMethod: SplitMethod;
  modelsDir: string;
}): { artifact: TrainedModelArtifact; artifactPath: string } {
  const {
    trainRecords,
    testRecords,
    algorithm,
    version,
    targetEndpoint,
    targetUnit,
    splitMethod,
    modelsDir,
  } = params;

  // CRITICAL: Fit preprocessing ONLY on training records to prevent data leakage
  const prep = fitPreprocessor(trainRecords);
  const XTrain = trainRecords.map((r) => transformRecord(r, prep));
  const yTrain = trainRecords.map((r) => r.standard_value);
  const XTest = testRecords.map((r) => transformRecord(r, prep));
  const yTest = testRecords.map((r) => r.standard_value);

  const p = prep.featureNames.length;
  const rng = new SeededRng(42);
  let yPredTest: number[] = [];
  const rawImportances = Array(p).fill(0);

  let weights: number[] | undefined;
  let bias: number | undefined;
  let trees: SerializedTree[] | undefined;
  let learningRate: number | undefined;

  if (algorithm === 'dummy_regressor') {
    const mean = yTrain.reduce((s, v) => s + v, 0) / Math.max(1, yTrain.length);
    bias = mean;
    yPredTest = XTest.map(() => mean);
  } else if (algorithm === 'ridge_regression') {
    const ridge = trainRidge(XTrain, yTrain, 1.5);
    weights = ridge.weights;
    bias = ridge.bias;
    for (let j = 0; j < p; j++) {
      rawImportances[j] = Math.abs(weights[j] || 0);
    }
    yPredTest = XTest.map(
      (x) => bias! + x.reduce((s, v, j) => s + v * (weights![j] || 0), 0)
    );
  } else if (algorithm === 'random_forest') {
    const nTrees = 35;
    const maxFeatures = Math.max(1, Math.round(Math.sqrt(p)));
    trees = [];
    for (let t = 0; t < nTrees; t++) {
      const bootIdx: number[] = [];
      for (let i = 0; i < XTrain.length; i++) {
        bootIdx.push(Math.floor(rng.next() * XTrain.length));
      }
      const tree = buildCartTree(
        XTrain,
        yTrain,
        bootIdx,
        0,
        7,
        4,
        maxFeatures,
        rng,
        rawImportances
      );
      trees.push(tree);
    }
    yPredTest = XTest.map((x) => {
      const sum = trees!.reduce((s, tr) => s + predictTree(tr, x), 0);
      return sum / trees!.length;
    });
  } else if (algorithm === 'gradient_boosting') {
    const nEstimators = 45;
    learningRate = 0.1;
    const baseMean = yTrain.reduce((s, v) => s + v, 0) / Math.max(1, yTrain.length);
    bias = baseMean;
    const trainPreds = Array(XTrain.length).fill(baseMean);
    trees = [];
    const allIdx = Array.from({ length: XTrain.length }, (_, i) => i);

    for (let m = 0; m < nEstimators; m++) {
      const residuals = yTrain.map((yVal, i) => yVal - trainPreds[i]);
      const tree = buildCartTree(
        XTrain,
        residuals,
        allIdx,
        0,
        4,
        4,
        p,
        rng,
        rawImportances
      );
      trees.push(tree);
      for (let i = 0; i < XTrain.length; i++) {
        trainPreds[i] += learningRate * predictTree(tree, XTrain[i]);
      }
    }

    yPredTest = XTest.map((x) => {
      let pred = bias!;
      for (const tr of trees!) {
        pred += learningRate! * predictTree(tr, x);
      }
      return pred;
    });
  }

  const metrics = computeMetrics(yTest, yPredTest);
  const impSum = rawImportances.reduce((s, v) => s + v, 0) || 1;
  const featureImportance = prep.featureNames
    .map((feature, j) => ({
      feature,
      importance: Number((rawImportances[j] / impSum).toFixed(4)),
    }))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 12);

  const actualVsPredicted = yTest.map((actual, i) => ({
    actual: Number(actual.toFixed(4)),
    predicted: Number(yPredTest[i].toFixed(4)),
    record_id: testRecords[i]?.record_id ?? `T_${i + 1}`,
  }));

  const residuals = yTest.map((actual, i) => actual - yPredTest[i]);
  const residualsHistogram = buildResidualHistogram(residuals);

  const artifact: TrainedModelArtifact = {
    algorithm,
    version,
    target_endpoint: targetEndpoint,
    target_unit: targetUnit,
    split_method: splitMethod,
    preprocessor: prep,
    weights,
    bias,
    trees,
    learning_rate: learningRate,
    metrics: {
      ...metrics,
      train_samples: trainRecords.length,
      test_samples: testRecords.length,
    },
    feature_importance: featureImportance,
    evaluation_plot: {
      actual_vs_predicted: actualVsPredicted,
      residuals_histogram: residualsHistogram,
    },
  };

  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }
  const filename = `${algorithm}_${version.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`;
  const artifactPath = path.join(modelsDir, filename);
  fs.writeFileSync(artifactPath, JSON.stringify(artifact), 'utf-8');

  return { artifact, artifactPath };
}

export function predictWithArtifact(
  artifact: TrainedModelArtifact,
  descriptors: MolecularDescriptors,
  context: {
    assay_type: string;
    organism_or_model: string;
  }
): {
  predicted_value: number;
  in_domain: boolean;
  domain_distance: number;
  applicability_warning: string | null;
} {
  const prep = artifact.preprocessor;
  const x = transformRecord(
    {
      molecular_weight: descriptors.molecular_weight,
      logp: descriptors.logp,
      tpsa: descriptors.tpsa,
      hbd: descriptors.hbd,
      hba: descriptors.hba,
      rotatable_bonds: descriptors.rotatable_bonds,
      ring_count: descriptors.ring_count,
      heavy_atoms: descriptors.heavy_atoms,
      aromatic_atoms: descriptors.aromatic_atoms,
      assay_type: context.assay_type,
      organism_or_model: context.organism_or_model,
    },
    prep
  );

  let predicted = 0;
  if (artifact.algorithm === 'dummy_regressor') {
    predicted = artifact.bias ?? 0;
  } else if (artifact.algorithm === 'ridge_regression') {
    const weights = artifact.weights ?? [];
    predicted =
      (artifact.bias ?? 0) +
      x.reduce((s, v, j) => s + v * (weights[j] || 0), 0);
  } else if (artifact.algorithm === 'random_forest') {
    const trees = artifact.trees ?? [];
    predicted =
      trees.reduce((s, tr) => s + predictTree(tr, x), 0) / Math.max(1, trees.length);
  } else if (artifact.algorithm === 'gradient_boosting') {
    const trees = artifact.trees ?? [];
    const lr = artifact.learning_rate ?? 0.1;
    predicted = artifact.bias ?? 0;
    for (const tr of trees) {
      predicted += lr * predictTree(tr, x);
    }
  }

  // Applicability domain assessment: RMS standardized distance across numeric descriptors + range bounds
  const numCount = prep.numericFeatures.length;
  let sqZ = 0;
  const outOfRangeDescriptors: string[] = [];
  const rawVals = [
    descriptors.molecular_weight,
    descriptors.logp,
    descriptors.tpsa,
    descriptors.hbd,
    descriptors.hba,
    descriptors.rotatable_bonds,
    descriptors.ring_count,
    descriptors.heavy_atoms,
    descriptors.aromatic_atoms,
  ];

  for (let j = 0; j < numCount; j++) {
    sqZ += x[j] * x[j];
    const minVal = prep.featureMins[j];
    const maxVal = prep.featureMaxs[j];
    if (rawVals[j] < minVal * 0.9 || rawVals[j] > maxVal * 1.1) {
      outOfRangeDescriptors.push(prep.numericFeatures[j]);
    }
  }
  const rmsZ = Math.sqrt(sqZ / Math.max(1, numCount));
  const unseenAssay = !prep.assayTypes.includes(context.assay_type);
  const unseenOrg = !prep.organisms.includes(context.organism_or_model);

  const warnings: string[] = [];
  if (rmsZ > 2.5 || outOfRangeDescriptors.length > 0) {
    warnings.push(
      `Molecular descriptor distance (RMS z=${rmsZ.toFixed(2)}) or range (${outOfRangeDescriptors.join(', ') || 'feature space'}) lies outside the training applicability domain.`
    );
  }
  if (unseenAssay) {
    warnings.push(`Assay type "${context.assay_type}" was not observed during model training.`);
  }
  if (unseenOrg) {
    warnings.push(`Organism/model "${context.organism_or_model}" was not observed during model training.`);
  }

  return {
    predicted_value: Number(predicted.toFixed(4)),
    in_domain: warnings.length === 0,
    domain_distance: Number(rmsZ.toFixed(3)),
    applicability_warning: warnings.length > 0 ? warnings.join(' ') : null,
  };
}
