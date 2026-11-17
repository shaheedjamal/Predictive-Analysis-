import React, { useEffect, useState } from 'react';
import { Cpu, Play, CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../api';
import type { DatasetRecord, ModelRecord } from '../types';

const ALGORITHMS = [
  { id: 'dummy_regressor', name: 'Dummy Regressor (Mean Baseline)', desc: 'Constant mean baseline for verifying non-trivial signal.' },
  { id: 'ridge_regression', name: 'Ridge Regression (L2)', desc: 'Linear L2-regularized regression over standardized descriptors.' },
  { id: 'random_forest', name: 'Random Forest Regressor', desc: 'Bootstrap ensemble of CART decision trees with feature subsampling.' },
  { id: 'gradient_boosting', name: 'Gradient Boosting Regressor', desc: 'Stage-wise residual trees with 0.1 shrinkage learning rate.' },
];

export const TrainingPage: React.FC = () => {
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [splitMethod, setSplitMethod] = useState<'scaffold' | 'group' | 'random_exploratory'>('scaffold');
  const [testRatio, setTestRatio] = useState(0.2);
  const [selectedAlgos, setSelectedAlgos] = useState<string[]>([
    'dummy_regressor',
    'ridge_regression',
    'random_forest',
    'gradient_boosting',
  ]);
  const [activateBest, setActivateBest] = useState(true);

  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ModelRecord[] | null>(null);
  const [effectiveSplit, setEffectiveSplit] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ datasets: DatasetRecord[] }>('/api/datasets')
      .then((res) => {
        const ready = res.datasets.filter((d) => d.status === 'preprocessed');
        setDatasets(ready);
        if (ready.length > 0) setSelectedDatasetId(String(ready[0].id));
      })
      .catch(() => {});
  }, []);

  const toggleAlgo = (id: string) => {
    setSelectedAlgos((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleTrain = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResults(null);
    if (!selectedDatasetId) {
      setError('Select a preprocessed dataset first.');
      return;
    }
    if (selectedAlgos.length === 0) {
      setError('Select at least one model algorithm to train.');
      return;
    }

    setTraining(true);
    try {
      const res = await apiFetch<{
        models: ModelRecord[];
        effective_split: string;
      }>('/api/models/train', {
        method: 'POST',
        body: JSON.stringify({
          dataset_id: Number(selectedDatasetId),
          algorithms: selectedAlgos,
          split_method: splitMethod,
          test_ratio: testRatio,
          activate_best: activateBest,
        }),
      });
      setResults(res.models);
      setEffectiveSplit(res.effective_split);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Model training failed.');
    } finally {
      setTraining(false);
    }
  };

  const activeDs = datasets.find((d) => String(d.id) === selectedDatasetId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <form
        onSubmit={handleTrain}
        className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900">Training Configuration</h2>
          <p className="text-xs text-slate-500">
            Preprocessing scalers and encoders are fit strictly on training folds to prevent data leakage.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Preprocessed Dataset
          </label>
          <select
            value={selectedDatasetId}
            onChange={(e) => setSelectedDatasetId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            {datasets.length === 0 && <option value="">No preprocessed datasets available</option>}
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.valid_row_count} rows · {d.endpoint})
              </option>
            ))}
          </select>
          {activeDs?.is_synthetic_demo === 1 && (
            <div className="mt-2 text-xs text-amber-800 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Synthetic demo dataset selected. Trained models will be marked as Demo Mode.</span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Validation Split Strategy
          </label>
          <div className="space-y-2 text-xs">
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
              <input
                type="radio"
                name="split"
                checked={splitMethod === 'scaffold'}
                onChange={() => setSplitMethod('scaffold')}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium text-slate-900">Scaffold-Based Split (Recommended)</div>
                <div className="text-slate-500">Groups molecules by ring framework to prevent analog leakage.</div>
              </div>
            </label>
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
              <input
                type="radio"
                name="split"
                checked={splitMethod === 'group'}
                onChange={() => setSplitMethod('group')}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium text-slate-900">Study / Assay Group Split</div>
                <div className="text-slate-500">Holds out entire target-assay groups to evaluate cross-assay generalization.</div>
              </div>
            </label>
            <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-amber-200 bg-amber-50/40 cursor-pointer">
              <input
                type="radio"
                name="split"
                checked={splitMethod === 'random_exploratory'}
                onChange={() => setSplitMethod('random_exploratory')}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium text-slate-900">Random Split (Exploratory Only)</div>
                <div className="text-amber-800">May overestimate generalization when structurally similar analogs appear in both train and test.</div>
              </div>
            </label>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
            <span>Holdout Test Ratio</span>
            <span className="font-mono tabular-nums">{Math.round(testRatio * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={0.4}
            step={0.05}
            value={testRatio}
            onChange={(e) => setTestRatio(Number(e.target.value))}
            className="w-full accent-cyan-700"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Algorithms to Train & Compare
          </label>
          <div className="space-y-2">
            {ALGORITHMS.map((a) => (
              <label
                key={a.id}
                className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 text-xs"
              >
                <input
                  type="checkbox"
                  checked={selectedAlgos.includes(a.id)}
                  onChange={() => toggleAlgo(a.id)}
                  className="mt-0.5 rounded"
                />
                <div>
                  <div className="font-medium text-slate-900">{a.name}</div>
                  <div className="text-slate-500">{a.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={activateBest}
            onChange={(e) => setActivateBest(e.target.checked)}
            className="rounded"
          />
          <span>Automatically activate best non-dummy model (highest held-out R²)</span>
        </label>

        <button
          type="submit"
          disabled={training || datasets.length === 0}
          className="w-full py-2.5 px-4 rounded-lg bg-[#0B1221] text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4" />
          <span>{training ? 'Training Pipeline Running...' : 'Run Training Pipeline'}</span>
        </button>
      </form>

      {/* Output Comparison Panel */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Measured Training Results</h2>
            <p className="text-xs text-slate-500">
              All metrics are computed strictly on unseen held-out test folds
            </p>
          </div>
          {effectiveSplit && (
            <span className="text-xs font-mono text-slate-600">
              Split: {effectiveSplit}
            </span>
          )}
        </div>

        {!results ? (
          <div className="py-16 text-center text-xs text-slate-500">
            <Cpu className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            Configure parameters and run the training pipeline to train, evaluate, and persist model artifacts.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Trained {results.length} model artifacts and saved evaluation metadata to SQLite.
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Model</th>
                    <th className="py-2 pr-3 font-medium">Version</th>
                    <th className="py-2 pr-3 font-medium text-right">Train / Test</th>
                    <th className="py-2 pr-3 font-medium text-right">MAE</th>
                    <th className="py-2 pr-3 font-medium text-right">RMSE</th>
                    <th className="py-2 font-medium text-right">R²</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">{m.name}</td>
                      <td className="py-2.5 pr-3 font-mono text-slate-600">{m.version}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                        {m.train_samples} / {m.test_samples}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{m.mae}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{m.rmse}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums font-semibold text-cyan-700">
                        {m.r2}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
