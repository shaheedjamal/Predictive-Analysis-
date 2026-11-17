import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FlaskConical } from 'lucide-react';
import { apiFetch } from '../api';
import type { ModelRecord } from '../types';

interface PredictionOutput {
  id: number;
  prediction_code: string;
  created_at: string;
  compound: {
    name: string;
    original_smiles: string;
    canonical_smiles: string;
    molecular_formula: string;
    svg: string;
  };
  descriptors: {
    molecular_weight: number;
    logp: number;
    tpsa: number;
    hbd: number;
    hba: number;
    rotatable_bonds: number;
    ring_count: number;
    heavy_atoms: number;
    lipinski_violations: number;
    veber_compliant: boolean;
  };
  context: {
    assay_type: string;
    target_name: string;
    biological_model: string;
    organism: string;
    endpoint: string;
    exposure_duration: string;
  };
  prediction: {
    predicted_value: number;
    predicted_unit: string;
    endpoint: string;
    in_domain: boolean;
    domain_distance: number;
    applicability_warning: string | null;
  };
  model: {
    id: number;
    name: string;
    algorithm: string;
    version: string;
    split_method: string;
    mae: number;
    rmse: number;
    r2: number;
    is_demo: boolean;
  };
  disclaimer: string;
}

const EXAMPLE_MOLECULES = [
  { label: 'Erlotinib', name: 'Erlotinib (EGFR Inhibitor)', smiles: 'COc1cc2ncnc(Nc3cccc(C#C)c3)c2cc1OCCOC', assay: 'Kinase Binding', target: 'EGFR' },
  { label: 'Aspirin', name: 'Aspirin (Acetylsalicylic Acid)', smiles: 'CC(=O)Oc1ccccc1C(=O)O', assay: 'Biochemical', target: 'PTGS2' },
  { label: 'Imatinib', name: 'Imatinib', smiles: 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1', assay: 'Cell Viability', target: 'ABL1' },
  { label: 'Sorafenib', name: 'Sorafenib', smiles: 'CNC(=O)c1cc(Oc2ccc(NC(=O)Nc3ccc(Cl)c(C(F)(F)F)c3)cc2)ccn1', assay: 'Kinase Binding', target: 'VEGFR2' },
];

export const PredictionPage: React.FC = () => {
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [compoundName, setCompoundName] = useState('Erlotinib Reference');
  const [smiles, setSmiles] = useState('COc1cc2ncnc(Nc3cccc(C#C)c3)c2cc1OCCOC');
  const [assayType, setAssayType] = useState('Kinase Binding');
  const [targetName, setTargetName] = useState('EGFR');
  const [biologicalModel, setBiologicalModel] = useState('A431 Cell Line');
  const [organism, setOrganism] = useState('Homo sapiens');
  const [endpoint, setEndpoint] = useState('pIC50');
  const [exposureDuration, setExposureDuration] = useState('72 hours');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionOutput | null>(null);

  useEffect(() => {
    apiFetch<{ models: ModelRecord[] }>('/api/models')
      .then((res) => {
        setModels(res.models);
        const active = res.models.find((m) => m.is_active === 1) ?? res.models[0];
        if (active) {
          setSelectedModelId(String(active.id));
          setEndpoint(active.target_endpoint);
        }
      })
      .catch(() => {});
  }, []);

  const handleLoadExample = (ex: (typeof EXAMPLE_MOLECULES)[number]) => {
    setCompoundName(ex.name);
    setSmiles(ex.smiles);
    setAssayType(ex.assay);
    setTargetName(ex.target);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = await apiFetch<PredictionOutput>('/api/predict', {
        method: 'POST',
        body: JSON.stringify({
          compound_name: compoundName,
          smiles,
          assay_type: assayType,
          target_name: targetName,
          biological_model: biologicalModel,
          organism,
          endpoint,
          exposure_duration: exposureDuration,
          model_id: selectedModelId ? Number(selectedModelId) : undefined,
        }),
      });
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prediction request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Compound & Assay Parameters</h2>
            <p className="text-xs text-slate-500">Enter molecular SMILES and experimental context</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_MOLECULES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => handleLoadExample(ex)}
              className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            >
              {ex.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Compound Name (optional)
          </label>
          <input
            type="text"
            value={compoundName}
            onChange={(e) => setCompoundName(e.target.value)}
            placeholder="e.g., Candidate Compound A"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-600"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            SMILES Molecular Structure <span className="text-rose-600">*</span>
          </label>
          <textarea
            rows={2}
            required
            value={smiles}
            onChange={(e) => setSmiles(e.target.value)}
            placeholder="CC(=O)Oc1ccccc1C(=O)O"
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Assay Type <span className="text-rose-600">*</span>
            </label>
            <select
              value={assayType}
              onChange={(e) => setAssayType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            >
              <option value="Kinase Binding">Kinase Binding</option>
              <option value="Cell Viability">Cell Viability</option>
              <option value="Biochemical">Biochemical</option>
              <option value="Radioligand">Radioligand</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Target Name <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="EGFR, PTGS2, ABL1"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Biological Model <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={biologicalModel}
              onChange={(e) => setBiologicalModel(e.target.value)}
              placeholder="HeLa Cell Line"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Organism <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={organism}
              onChange={(e) => setOrganism(e.target.value)}
              placeholder="Homo sapiens"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Endpoint <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Exposure Duration
            </label>
            <input
              type="text"
              value={exposureDuration}
              onChange={(e) => setExposureDuration(e.target.value)}
              placeholder="72 hours"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Trained Model Version
          </label>
          <select
            value={selectedModelId}
            onChange={(e) => {
              setSelectedModelId(e.target.value);
              const m = models.find((x) => String(x.id) === e.target.value);
              if (m) setEndpoint(m.target_endpoint);
            }}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.version} · R²={m.r2})
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 px-4 rounded-lg bg-[#0B1221] text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
        >
          <FlaskConical className="w-4 h-4" />
          <span>{submitting ? 'Computing Estimate...' : 'Generate Research Estimate'}</span>
        </button>
      </form>

      {/* Prediction Output Stage */}
      <div className="lg:col-span-7 space-y-6">
        {!result ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <FlaskConical className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-900">Ready for Endpoint Estimation</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Submit a valid SMILES structure and assay context on the left. The backend validates the SMILES graph, extracts molecular descriptors, runs the trained regression model, evaluates applicability domain distance, and logs the record to SQLite.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="text-xs text-slate-500 font-mono">
                  {result.prediction_code} · {result.created_at}
                </div>
                <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
                  {result.compound.name}
                </h2>
                <div className="text-xs text-slate-600 mt-0.5">
                  Formula: <span className="font-mono">{result.compound.molecular_formula}</span> · Model: {result.model.name} ({result.model.version})
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`/api/reports/predictions/${result.id}?format=pdf`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B1221] text-white text-xs font-medium hover:bg-slate-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF Report</span>
                </a>
                <a
                  href={`/api/reports/predictions/${result.id}?format=csv`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </a>
              </div>
            </div>

            {/* Predicted Value + 2D Structure */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-xs font-medium text-slate-500">
                  Estimated {result.prediction.endpoint} Endpoint
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold font-mono tabular-nums text-cyan-700">
                    {result.prediction.predicted_value.toFixed(4)}
                  </span>
                  <span className="text-xs font-mono text-slate-500">
                    {result.prediction.predicted_unit}
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  Held-out model metrics: MAE {result.model.mae} · RMSE {result.model.rmse} · R² {result.model.r2}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center bg-white">
                <div
                  className="max-w-full overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: result.compound.svg }}
                />
                <div className="text-[11px] font-mono text-slate-500 mt-1 truncate max-w-full">
                  Canonical: {result.compound.canonical_smiles}
                </div>
              </div>
            </div>

            {/* Applicability Domain Alert */}
            {result.prediction.in_domain ? (
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Within Applicability Domain:</strong> Standardized descriptor RMS z-distance is{' '}
                  <span className="font-mono">{result.prediction.domain_distance}</span>, within training feature bounds.
                </span>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Applicability-Domain Warning:</strong> {result.prediction.applicability_warning}
                </span>
              </div>
            )}

            {/* Molecular Descriptors Table */}
            <div>
              <h3 className="text-xs font-semibold text-slate-700 mb-2">
                Extracted Molecular Descriptors
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Molecular Weight</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                    {result.descriptors.molecular_weight} Da
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">LogP (cLogP)</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                    {result.descriptors.logp}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">TPSA</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                    {result.descriptors.tpsa} Å²
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">HBD / HBA</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                    {result.descriptors.hbd} / {result.descriptors.hba}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Rotatable Bonds</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                    {result.descriptors.rotatable_bonds}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Ring Count</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                    {result.descriptors.ring_count}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Lipinski Violations</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                    {result.descriptors.lipinski_violations}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Veber Rules</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {result.descriptors.veber_compliant ? 'Compliant' : 'Exceeded'}
                  </div>
                </div>
              </div>
            </div>

            {/* Research Disclaimer */}
            <div className="p-3.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 leading-relaxed">
              <strong>Research-Use Disclaimer:</strong> {result.disclaimer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
