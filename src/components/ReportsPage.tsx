import React, { useEffect, useState } from 'react';
import { Download, FileText, Package } from 'lucide-react';
import { apiFetch } from '../api';
import type { ModelRecord, PredictionRecord } from '../types';

export const ReportsPage: React.FC = () => {
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<{ predictions: PredictionRecord[] }>('/api/predictions'),
      apiFetch<{ models: ModelRecord[] }>('/api/models'),
    ])
      .then(([pRes, mRes]) => {
        setPredictions(pRes.predictions);
        setModels(mRes.models);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Windows Python/Flask Deliverable Package Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Package className="w-4 h-4 text-cyan-700" />
            <span>Windows Local Python / Flask / RDKit / scikit-learn Project Archive</span>
          </div>
          <p className="text-xs text-slate-600">
            Download the standalone Windows 10/11 Python Flask project bundle (`drug-efficacy-insight-windows.zip`) complete with SQLAlchemy models, RDKit chemistry pipeline, scikit-learn training scripts, automated pytest suite, synthetic demo CSV, and step-by-step README.
          </p>
        </div>
        <a
          href="/api/project/download-windows-zip"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0B1221] text-white text-xs font-medium hover:bg-slate-800 whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>Download Windows Project (.zip)</span>
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Prediction PDF/CSV Reports */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Prediction Research Reports</h2>
            <p className="text-xs text-slate-500">
              Includes compound descriptors, experimental context, model metrics, limitations, and research disclaimer.
            </p>
          </div>

          {loading ? (
            <div className="h-32 animate-pulse bg-slate-100 rounded-lg" />
          ) : (
            <div className="divide-y divide-slate-100">
              {predictions.slice(0, 10).map((p) => (
                <div key={p.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{p.compound_name}</div>
                    <div className="font-mono text-slate-500 truncate">
                      {p.prediction_code} · {p.predicted_value.toFixed(3)} {p.predicted_unit}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/api/reports/predictions/${p.id}?format=pdf`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0B1221] text-white hover:bg-slate-800"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </a>
                    <a
                      href={`/api/reports/predictions/${p.id}?format=csv`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Model Evaluation Reports */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Model Evaluation CSV Exports</h2>
            <p className="text-xs text-slate-500">
              Export held-out test actual vs predicted values, residuals, and summary metrics.
            </p>
          </div>

          {loading ? (
            <div className="h-32 animate-pulse bg-slate-100 rounded-lg" />
          ) : (
            <div className="divide-y divide-slate-100">
              {models.map((m) => (
                <div key={m.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{m.name}</div>
                    <div className="font-mono text-slate-500 truncate">
                      {m.version} · R²={m.r2} · RMSE={m.rmse} · {m.split_method}
                    </div>
                  </div>
                  <a
                    href={`/api/reports/models/${m.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
