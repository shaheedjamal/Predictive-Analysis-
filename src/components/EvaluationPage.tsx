import React, { useEffect, useState } from 'react';
import { Bar, Scatter } from 'react-chartjs-2';
import { CheckCircle2, Download } from 'lucide-react';
import { apiFetch } from '../api';
import type { ModelRecord } from '../types';

export const EvaluationPage: React.FC = () => {
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadModels = async (focusId?: number) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ models: ModelRecord[] }>('/api/models');
      setModels(res.models);
      const target =
        (focusId ? res.models.find((m) => m.id === focusId) : null) ??
        res.models.find((m) => m.is_active === 1) ??
        res.models[0];
      if (target) {
        const detail = await apiFetch<{ model: ModelRecord }>(
          `/api/models/${target.id}/metrics`
        );
        setSelectedModel(detail.model);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model evaluations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const handleSelectModel = async (id: number) => {
    try {
      const detail = await apiFetch<{ model: ModelRecord }>(`/api/models/${id}/metrics`);
      setSelectedModel(detail.model);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model metrics.');
    }
  };

  const handleActivate = async (id: number) => {
    try {
      await apiFetch(`/api/models/${id}/activate`, { method: 'PATCH' });
      await loadModels(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate model.');
    }
  };

  if (loading) {
    return <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />;
  }

  const evalPlot = selectedModel?.evaluation_plot;

  const scatterData = evalPlot
    ? {
        datasets: [
          {
            label: 'Held-Out Test Samples (Actual vs Predicted)',
            data: evalPlot.actual_vs_predicted.map((pt) => ({
              x: pt.actual,
              y: pt.predicted,
            })),
            backgroundColor: '#0891B2',
            pointRadius: 5,
          },
        ],
      }
    : null;

  const residualData = evalPlot
    ? {
        labels: evalPlot.residuals_histogram.map((b) => b.bin),
        datasets: [
          {
            label: 'Residual Count (Actual - Predicted)',
            data: evalPlot.residuals_histogram.map((b) => b.count),
            backgroundColor: '#7C3AED',
            borderRadius: 4,
          },
        ],
      }
    : null;

  const comparisonData = {
    labels: models.slice(0, 8).map((m) => `${m.algorithm} (${m.version})`),
    datasets: [
      {
        label: 'R²',
        data: models.slice(0, 8).map((m) => m.r2),
        backgroundColor: '#0891B2',
        borderRadius: 4,
      },
      {
        label: 'MAE',
        data: models.slice(0, 8).map((m) => m.mae),
        backgroundColor: '#0F172A',
        borderRadius: 4,
      },
      {
        label: 'RMSE',
        data: models.slice(0, 8).map((m) => m.rmse),
        backgroundColor: '#7C3AED',
        borderRadius: 4,
      },
    ],
  };

  const importanceData = selectedModel?.feature_importance
    ? {
        labels: selectedModel.feature_importance.map((f) => f.feature),
        datasets: [
          {
            label: 'Normalized Importance',
            data: selectedModel.feature_importance.map((f) => f.importance),
            backgroundColor: '#0891B2',
            borderRadius: 4,
          },
        ],
      }
    : null;

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Registry Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Model Evaluation Registry
            </h2>
            <p className="text-xs text-slate-500">
              Select a model row to inspect held-out residual diagnostics, scatter calibration, and feature importances.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Model Name</th>
                <th className="py-2 pr-3 font-medium">Training Dataset</th>
                <th className="py-2 pr-3 font-medium">Data Provenance</th>
                <th className="py-2 pr-3 font-medium">Split</th>
                <th className="py-2 pr-3 font-medium text-right">MAE</th>
                <th className="py-2 pr-3 font-medium text-right">RMSE</th>
                <th className="py-2 pr-3 font-medium text-right">R²</th>
                <th className="py-2 pr-3 font-medium">Version</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {models.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => handleSelectModel(m.id)}
                  className={`cursor-pointer ${
                    selectedModel?.id === m.id ? 'bg-cyan-50/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="py-2.5 pr-3 font-medium text-slate-900">{m.name}</td>
                  <td className="py-2.5 pr-3 text-slate-600">{m.dataset_name || '—'}</td>
                  <td className="py-2.5 pr-3 text-slate-600">
                    {m.is_demo ? 'Synthetic Demo (Measured)' : 'Curated Dataset (Measured)'}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-slate-600">{m.split_method}</td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{m.mae}</td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{m.rmse}</td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold text-cyan-700">
                    {m.r2}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-slate-600">{m.version}</td>
                  <td className="py-2.5 pr-3 text-slate-700 capitalize">
                    {m.is_active ? 'Active' : m.status}
                  </td>
                  <td className="py-2.5 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                    {!m.is_active && (
                      <button
                        type="button"
                        onClick={() => handleActivate(m.id)}
                        className="px-2.5 py-1 rounded border border-cyan-600/30 text-cyan-800 hover:bg-cyan-50"
                      >
                        Activate
                      </button>
                    )}
                    <a
                      href={`/api/reports/models/${m.id}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-100"
                    >
                      <Download className="w-3 h-3" />
                      <span>CSV</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedModel && (
        <div className="space-y-6">
          {/* Selected Model Summary Strip */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500">
                {selectedModel.is_demo
                  ? 'Measured Evaluation on Synthetic Demonstration Split'
                  : 'Measured Evaluation on Curated Experimental Split'}{' '}
                · Trained {selectedModel.created_at}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mt-0.5">
                {selectedModel.name} ({selectedModel.version})
              </h3>
            </div>
            <div className="flex flex-wrap gap-6 text-xs">
              <div>
                <div className="text-slate-500">MAE</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-slate-900">
                  {selectedModel.mae}
                </div>
              </div>
              <div>
                <div className="text-slate-500">RMSE</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-slate-900">
                  {selectedModel.rmse}
                </div>
              </div>
              <div>
                <div className="text-slate-500">R²</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-cyan-700">
                  {selectedModel.r2}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Samples (Train/Test)</div>
                <div className="text-lg font-semibold font-mono tabular-nums text-slate-900">
                  {selectedModel.train_samples} / {selectedModel.test_samples}
                </div>
              </div>
            </div>
          </div>

          {/* 4 Diagnostic Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h4 className="text-sm font-semibold text-slate-900 mb-1">
                Actual vs Predicted Values
              </h4>
              <p className="text-xs text-slate-500 mb-4">
                Held-out test set scatter ({selectedModel.target_endpoint} in {selectedModel.target_unit})
              </p>
              <div className="h-64">
                {scatterData && (
                  <Scatter
                    data={scatterData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        x: { title: { display: true, text: 'Actual Value' } },
                        y: { title: { display: true, text: 'Predicted Value' } },
                      },
                    }}
                  />
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h4 className="text-sm font-semibold text-slate-900 mb-1">
                Residual Distribution
              </h4>
              <p className="text-xs text-slate-500 mb-4">
                Histogram of prediction residuals (Actual minus Predicted)
              </p>
              <div className="h-64">
                {residualData && (
                  <Bar
                    data={residualData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                    }}
                  />
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h4 className="text-sm font-semibold text-slate-900 mb-1">
                Model Performance Comparison
              </h4>
              <p className="text-xs text-slate-500 mb-4">
                Comparison of R², MAE, and RMSE across trained baselines and ensembles
              </p>
              <div className="h-64">
                <Bar
                  data={comparisonData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true } },
                  }}
                />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h4 className="text-sm font-semibold text-slate-900 mb-1">
                Feature Importance
              </h4>
              <p className="text-xs text-slate-500 mb-4">
                Top normalized descriptor & assay context contributions
              </p>
              <div className="h-64">
                {importanceData && (
                  <Bar
                    data={importanceData}
                    options={{
                      indexAxis: 'y',
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
