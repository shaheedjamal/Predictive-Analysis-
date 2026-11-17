import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { resetDbForTests } from '../server/db.ts';
import { bootstrapInitialState } from '../server/services/seed.ts';
import { createApp } from '../server.ts';

let server: http.Server;
let baseUrl: string;
let adminCookie = '';
let researcherCookie = '';
let uploadedDatasetId = 0;
let createdPredictionId = 0;

async function req(
  path: string,
  options: RequestInit & { cookie?: string } = {}
): Promise<{ status: number; headers: Headers; text: string; json: any; buffer: ArrayBuffer }> {
  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.cookie) {
    headers['Cookie'] = options.cookie;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  const buffer = await res.arrayBuffer();
  const text = Buffer.from(buffer).toString('utf-8');
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json, buffer };
}

function extractCookie(headers: Headers): string {
  const raw = headers.get('set-cookie') || '';
  const match = raw.match(/dei_session=[^;]+/);
  return match ? match[0] : '';
}

test('Setup test server and seed synthetic demo environment', async () => {
  resetDbForTests(':memory:');
  await bootstrapInitialState();
  const app = await createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test('1. Access control rejects unauthenticated requests', async () => {
  const res = await req('/api/dashboard/stats');
  assert.equal(res.status, 401);
});

test('2. User registration (initial admin and second researcher)', async () => {
  const adminRes = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: 'lead_admin',
      email: 'admin@lab.test',
      password: 'StrongPassword123!',
      full_name: 'Dr. Ada Admin',
      institution: 'Institute of Pharmacology',
      setup_as_admin: true,
    }),
  });
  assert.equal(adminRes.status, 201);
  assert.equal(adminRes.json.user.role, 'Administrator');
  adminCookie = extractCookie(adminRes.headers);
  assert.ok(adminCookie.includes('dei_session='));

  const resUser = await req('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username: 'researcher_one',
      email: 'researcher@lab.test',
      password: 'ResearchPassword123!',
      full_name: 'Dr. Bob Researcher',
      setup_as_admin: true, // Should be ignored since admin already exists
    }),
  });
  assert.equal(resUser.status, 201);
  assert.equal(resUser.json.user.role, 'Researcher');
  researcherCookie = extractCookie(resUser.headers);
});

test('3. User login and invalid login rejection', async () => {
  const bad = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'researcher@lab.test', password: 'WrongPassword!' }),
  });
  assert.equal(bad.status, 401);

  const good = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'researcher@lab.test', password: 'ResearchPassword123!' }),
  });
  assert.equal(good.status, 200);
  assert.equal(good.json.user.username, 'researcher_one');
});

test('4. Role-based access control blocks non-admins from admin endpoints', async () => {
  const denied = await req('/api/admin/users', { cookie: researcherCookie });
  assert.equal(denied.status, 403);

  const allowed = await req('/api/admin/users', { cookie: adminCookie });
  assert.equal(allowed.status, 200);
  assert.ok(Array.isArray(allowed.json.users));
});

test('5. Dashboard stats load from SQLite database', async () => {
  const res = await req('/api/dashboard/stats', { cookie: researcherCookie });
  assert.equal(res.status, 200);
  assert.ok(res.json.summary.total_users >= 3);
  assert.ok(res.json.summary.available_models >= 4);
  assert.ok(res.json.charts.model_comparison.length >= 4);
});

test('6. SMILES validation & molecular descriptor calculation', async () => {
  const validRes = await req('/api/molecules/analyze', {
    method: 'POST',
    cookie: researcherCookie,
    body: JSON.stringify({ smiles: 'CC(=O)Oc1ccccc1C(=O)O' }),
  });
  assert.equal(validRes.status, 200);
  assert.equal(validRes.json.descriptors.molecular_formula, 'C9H8O4');
  assert.ok(validRes.json.descriptors.molecular_weight > 179 && validRes.json.descriptors.molecular_weight < 181);
  assert.ok(validRes.json.descriptors.svg.includes('<svg'));

  const invalidRes = await req('/api/molecules/analyze', {
    method: 'POST',
    cookie: researcherCookie,
    body: JSON.stringify({ smiles: 'C1CC((invalid' }),
  });
  assert.equal(invalidRes.status, 400);
  assert.ok(invalidRes.json.error);
});

test('7. Invalid prediction requests are rejected and valid predictions persist', async () => {
  const bad = await req('/api/predict', {
    method: 'POST',
    cookie: researcherCookie,
    body: JSON.stringify({
      compound_name: 'Bad SMILES',
      smiles: 'NOT_A_MOLECULE',
      assay_type: 'Biochemical',
      target_name: 'PTGS2',
      biological_model: 'Enzyme',
      organism: 'Homo sapiens',
      endpoint: 'pIC50',
    }),
  });
  assert.equal(bad.status, 400);

  const good = await req('/api/predict', {
    method: 'POST',
    cookie: researcherCookie,
    body: JSON.stringify({
      compound_name: 'Aspirin Test',
      smiles: 'CC(=O)Oc1ccccc1C(=O)O',
      assay_type: 'Biochemical',
      target_name: 'PTGS2',
      biological_model: 'Purified Enzyme',
      organism: 'Homo sapiens',
      endpoint: 'pIC50',
      exposure_duration: '30m',
    }),
  });
  assert.equal(good.status, 201);
  assert.ok(good.json.prediction_code.startsWith('PRED-'));
  assert.equal(typeof good.json.prediction.predicted_value, 'number');
  createdPredictionId = good.json.id;
});

test('8. CSV upload, preprocessing, and model training pipeline', async () => {
  const rows = [
    'record_id,compound_id,smiles,target_id,assay_id,assay_type,organism_or_model,endpoint,value,unit,standard_value,relation,protocol,source',
    'R1,C1,CC(=O)Oc1ccccc1C(=O)O,PTGS2,A1,Biochemical,Homo sapiens,pIC50,5.2,log10_M,5.2,=,p1,Lab',
    'R2,C2,CC(C)Cc1ccc(C(C)C(=O)O)cc1,PTGS2,A1,Biochemical,Homo sapiens,pIC50,5.6,log10_M,5.6,=,p1,Lab',
    'R3,C3,COc1ccc2cc(C(C)C(=O)O)ccc2c1,PTGS2,A1,Biochemical,Homo sapiens,pIC50,6.0,log10_M,6.0,=,p1,Lab',
    'R4,C4,Cn1cnc2c1c(=O)n(C)c(=O)n2C,ADORA2A,A2,Radioligand,Homo sapiens,pIC50,5.1,log10_M,5.1,=,p2,Lab',
    'R5,C5,Cn1c(=O)c2[nH]cnc2n(C)c1=O,ADORA2A,A2,Radioligand,Homo sapiens,pIC50,5.4,log10_M,5.4,=,p2,Lab',
    'R6,C6,COc1cc2ncnc(Nc3cccc(C#C)c3)c2cc1OCCOC,EGFR,A3,Kinase Binding,Homo sapiens,pIC50,7.8,log10_M,7.8,=,p3,Lab',
    'R7,C7,COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1,EGFR,A3,Kinase Binding,Homo sapiens,pIC50,8.1,log10_M,8.1,=,p3,Lab',
    'R8,C8,O=C1Nc2ccccc2/C1=C/c1ccc[nH]1,VEGFR2,A4,Cell Viability,Homo sapiens,pIC50,6.5,log10_M,6.5,=,p4,Lab',
    'R9,C9,O=c1ccc2ccccc2o1,MAOB,A5,Biochemical,Homo sapiens,pIC50,4.9,log10_M,4.9,=,p5,Lab',
    'R10,C10,O=c1cc(-c2ccccc2)oc2ccccc12,CYP1B1,A6,Biochemical,Homo sapiens,pIC50,6.3,log10_M,6.3,=,p6,Lab',
    'R11,C11,CC(=O)Nc1ccc(O)cc1,PTGS2,A1,Biochemical,Homo sapiens,pIC50,4.5,log10_M,4.5,=,p1,Lab',
    'R12,C12,CN(C)C(=N)NC(=N)N,AMPK,A7,Cell Viability,Mus musculus,pIC50,4.2,log10_M,4.2,=,p7,Lab',
  ].join('\n');

  const upRes = await req('/api/datasets/upload', {
    method: 'POST',
    cookie: researcherCookie,
    body: JSON.stringify({
      name: 'Test Lab Curated Set',
      filename: 'test_lab.csv',
      csv_content: rows,
    }),
  });
  assert.equal(upRes.status, 201);
  uploadedDatasetId = upRes.json.dataset.id;

  const prepRes = await req(`/api/datasets/${uploadedDatasetId}/preprocess`, {
    method: 'POST',
    cookie: researcherCookie,
    body: JSON.stringify({}),
  });
  assert.equal(prepRes.status, 200);
  assert.equal(prepRes.json.cleaned_count, 12);

  const trainRes = await req('/api/models/train', {
    method: 'POST',
    cookie: researcherCookie,
    body: JSON.stringify({
      dataset_id: uploadedDatasetId,
      algorithms: ['dummy_regressor', 'ridge_regression', 'random_forest', 'gradient_boosting'],
      split_method: 'scaffold',
      test_ratio: 0.25,
    }),
  });
  assert.equal(trainRes.status, 201);
  assert.equal(trainRes.json.models.length, 4);
  assert.equal(typeof trainRes.json.models[0].mae, 'number');
  assert.equal(typeof trainRes.json.models[0].rmse, 'number');
  assert.equal(typeof trainRes.json.models[0].r2, 'number');
});

test('9. Prediction history and PDF/CSV report generation', async () => {
  const histRes = await req('/api/predictions?search=Aspirin', { cookie: researcherCookie });
  assert.equal(histRes.status, 200);
  assert.ok(histRes.json.predictions.length >= 1);

  const pdfRes = await req(`/api/reports/predictions/${createdPredictionId}?format=pdf`, {
    cookie: researcherCookie,
  });
  assert.equal(pdfRes.status, 200);
  assert.ok(pdfRes.text.startsWith('%PDF-'));

  const csvRes = await req(`/api/reports/predictions/${createdPredictionId}?format=csv`, {
    cookie: researcherCookie,
  });
  assert.equal(csvRes.status, 200);
  assert.ok(csvRes.text.includes('prediction_id'));
});

test('Cleanup test server', async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
