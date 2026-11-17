export type PageId =
  | 'login'
  | 'register'
  | 'dashboard'
  | 'predict'
  | 'molecular'
  | 'datasets'
  | 'training'
  | 'evaluation'
  | 'history'
  | 'reports'
  | 'profile'
  | 'admin';

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  institution: string;
  role: 'Administrator' | 'Researcher';
  is_active: number;
  is_demo: number;
  created_at?: string;
  last_login?: string;
}

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

export interface DatasetRecord {
  id: number;
  name: string;
  filename: string;
  uploaded_by: number | null;
  uploader_name?: string;
  is_synthetic_demo: number;
  row_count: number;
  col_count: number;
  valid_row_count: number;
  missing_count: number;
  duplicate_count: number;
  endpoint: string | null;
  unit: string | null;
  schema_valid: number;
  status: string;
  validation_notes: string | null;
  created_at: string;
}

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

export interface ModelRecord {
  id: number;
  name: string;
  algorithm: string;
  version: string;
  dataset_id: number | null;
  dataset_name?: string;
  target_endpoint: string;
  target_unit: string;
  split_method: string;
  mae: number;
  rmse: number;
  r2: number;
  train_samples: number;
  test_samples: number;
  is_active: number;
  is_demo: number;
  status: string;
  trained_by_name?: string;
  created_at: string;
  feature_names?: string[];
  feature_importance?: { feature: string; importance: number }[];
  evaluation_plot?: {
    actual_vs_predicted: { actual: number; predicted: number; record_id: string }[];
    residuals_histogram: { bin: string; count: number }[];
  };
}

export interface PredictionRecord {
  id: number;
  prediction_code: string;
  user_id: number | null;
  user_name?: string;
  compound_name: string;
  original_smiles: string;
  canonical_smiles: string;
  molecular_formula: string;
  endpoint: string;
  assay_type: string;
  target_name: string;
  biological_model: string;
  organism: string;
  exposure_duration?: string;
  predicted_value: number;
  predicted_unit: string;
  in_domain: number;
  domain_distance: number;
  applicability_warning: string | null;
  model_name: string;
  algorithm: string;
  model_version: string;
  split_method?: string;
  mae?: number;
  rmse?: number;
  r2?: number;
  descriptors_json: string;
  context_json: string;
  is_demo: number;
  created_at: string;
  svg?: string;
}
