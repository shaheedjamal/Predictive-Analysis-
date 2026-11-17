import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

let dbInstance: DatabaseSync | null = null;

export function getDbPath(): string {
  const customPath = process.env.DATABASE_PATH;
  if (customPath) return customPath;
  const dir = path.resolve(process.cwd(), 'instance');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'drug_efficacy.db');
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    const dbPath = getDbPath();
    const dir = path.dirname(dbPath);
    if (dbPath !== ':memory:' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    dbInstance = new DatabaseSync(dbPath);
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function resetDbForTests(dbPath = ':memory:'): DatabaseSync {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore close errors
    }
    dbInstance = null;
  }
  dbInstance = new DatabaseSync(dbPath);
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  initSchema(dbInstance);
  return dbInstance;
}

export function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      institution TEXT DEFAULT 'Independent Research Lab',
      role TEXT NOT NULL CHECK(role IN ('Administrator', 'Researcher')) DEFAULT 'Researcher',
      is_active INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_synthetic_demo INTEGER NOT NULL DEFAULT 0,
      row_count INTEGER NOT NULL DEFAULT 0,
      col_count INTEGER NOT NULL DEFAULT 0,
      valid_row_count INTEGER NOT NULL DEFAULT 0,
      missing_count INTEGER NOT NULL DEFAULT 0,
      duplicate_count INTEGER NOT NULL DEFAULT 0,
      endpoint TEXT,
      unit TEXT,
      schema_valid INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'uploaded',
      raw_path TEXT,
      processed_path TEXT,
      stats_json TEXT,
      validation_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS compounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      compound_code TEXT NOT NULL,
      name TEXT,
      original_smiles TEXT NOT NULL,
      canonical_smiles TEXT NOT NULL,
      molecular_formula TEXT,
      molecular_weight REAL,
      logp REAL,
      tpsa REAL,
      hbd INTEGER,
      hba INTEGER,
      rotatable_bonds INTEGER,
      ring_count INTEGER,
      heavy_atoms INTEGER,
      scaffold_smiles TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assay_code TEXT,
      assay_type TEXT NOT NULL,
      target_name TEXT NOT NULL,
      biological_model TEXT NOT NULL,
      organism TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'pIC50',
      exposure_duration TEXT,
      protocol TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      record_id TEXT NOT NULL,
      compound_id INTEGER REFERENCES compounds(id) ON DELETE SET NULL,
      assay_id INTEGER REFERENCES assays(id) ON DELETE SET NULL,
      scaffold_group TEXT,
      value REAL,
      standard_value REAL,
      unit TEXT,
      relation TEXT DEFAULT '=',
      source TEXT,
      is_valid INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      version TEXT NOT NULL,
      dataset_id INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
      target_endpoint TEXT NOT NULL,
      target_unit TEXT NOT NULL,
      split_method TEXT NOT NULL,
      mae REAL NOT NULL,
      rmse REAL NOT NULL,
      r2 REAL NOT NULL,
      train_samples INTEGER NOT NULL,
      test_samples INTEGER NOT NULL,
      feature_names_json TEXT NOT NULL,
      feature_importance_json TEXT NOT NULL,
      evaluation_plot_json TEXT NOT NULL,
      artifact_path TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'trained',
      trained_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prediction_code TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      compound_id INTEGER NOT NULL REFERENCES compounds(id) ON DELETE CASCADE,
      assay_id INTEGER NOT NULL REFERENCES assays(id) ON DELETE CASCADE,
      model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
      predicted_value REAL NOT NULL,
      predicted_unit TEXT NOT NULL,
      in_domain INTEGER NOT NULL DEFAULT 1,
      domain_distance REAL NOT NULL DEFAULT 0,
      applicability_warning TEXT,
      descriptors_json TEXT NOT NULL,
      context_json TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      username TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
    CREATE INDEX IF NOT EXISTS idx_predictions_created ON predictions(created_at);
    CREATE INDEX IF NOT EXISTS idx_measurements_dataset ON measurements(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);
}
