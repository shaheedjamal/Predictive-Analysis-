import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Play,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../api';
import type { DatasetDiagnostics, DatasetRecord } from '../types';

export const DatasetsPage: React.FC = () => {
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [diagnostics, setDiagnostics] = useState<DatasetDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preprocessing, setPreprocessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [datasetName, setDatasetName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetEndpoint, setTargetEndpoint] = useState('');
  const [targetUnit, setTargetUnit] = useState('');

  const loadDatasets = async (selectLatest = false) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ datasets: DatasetRecord[] }>('/api/datasets');
      setDatasets(res.datasets);
      if (res.datasets.length > 0) {
        const idToInspect = selectLatest
          ? res.datasets[0].id
          : selectedId ?? res.datasets[0].id;
        setSelectedId(idToInspect);
        await loadDetails(idToInspect);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load datasets.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async (id: number) => {
    try {
      const res = await apiFetch<{
        dataset: DatasetRecord;
        diagnostics: DatasetDiagnostics | null;
      }>(`/api/datasets/${id}`);
      setDiagnostics(res.diagnostics);
      if (res.diagnostics) {
        const eps = Object.keys(res.diagnostics.endpoints);
        const units = Object.keys(res.diagnostics.units);
        setTargetEndpoint(eps[0] ?? 'pIC50');
        setTargetUnit(units[0] ?? 'log10_M');
      }
    } catch {
      setDiagnostics(null);
    }
  };

  useEffect(() => {
    loadDatasets();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a .csv file to upload.');
      return;
    }
    setError(null);
    setMessage(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (datasetName.trim()) {
        formData.append('name', datasetName.trim());
      }
      const res = await apiFetch<{ dataset: DatasetRecord }>('/api/datasets/upload', {
        method: 'POST',
        body: formData,
      });
      setMessage(`Uploaded "${res.dataset.name}" (${res.dataset.row_count} rows).`);
      setSelectedFile(null);
      setDatasetName('');
      await loadDatasets(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handlePreprocess = async (id: number) => {
    setError(null);
    setMessage(null);
    setPreprocessing(true);
    try {
      const res = await apiFetch<{
        dataset: DatasetRecord;
        cleaned_count: number;
        dropped_count: number;
      }>(`/api/datasets/${id}/preprocess`, {
        method: 'POST',
        body: JSON.stringify({
          target_endpoint: targetEndpoint || undefined,
          target_unit: targetUnit || undefined,
        }),
      });
      setMessage(
        `Preprocessing complete: ${res.cleaned_count} valid records retained, ${res.dropped_count} dropped.`
      );
      await loadDatasets();
      await loadDetails(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preprocessing failed.');
    } finally {
      setPreprocessing(false);
    }
  };

  const handleDelete = async (id: number) => {
    setError(null);
    setMessage(null);
    try {
      await apiFetch(`/api/datasets/${id}`, { method: 'DELETE' });
      setMessage('Dataset deleted.');
      setSelectedId(null);
      setDiagnostics(null);
      await loadDatasets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete dataset.');
    }
  };

  const activeDataset = datasets.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
          {message}
        </div>
      )}

      {/* Upload & Documented Schema Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleUpload}
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-slate-900">Upload Experimental CSV Dataset</h2>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Dataset Name (optional)
            </label>
            <input
              type="text"
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              placeholder="e.g., EGFR Kinase Curated Panel"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              CSV File (.csv)
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-slate-300 file:bg-slate-50 file:text-xs file:font-medium hover:file:bg-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="px-4 py-2.5 rounded-lg bg-[#0B1221] text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-60 inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            <span>{uploading ? 'Uploading & Inspecting...' : 'Upload CSV Dataset'}</span>
          </button>
        </form>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Documented Dataset Schema</h2>
          <p className="text-xs text-slate-500">
            CSV datasets must include the 14 standardized research columns below. Preprocessing enforces endpoint and measurement unit consistency.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono text-slate-700">
            {[
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
            ].map((col) => (
              <div key={col} className="px-2.5 py-1.5 rounded bg-slate-50 border border-slate-200 truncate">
                {col}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dataset Registry */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Dataset Registry</h2>
        {loading ? (
          <div className="h-24 animate-pulse bg-slate-100 rounded-lg" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Dataset</th>
                  <th className="py-2 pr-3 font-medium">Origin</th>
                  <th className="py-2 pr-3 font-medium text-right">Rows</th>
                  <th className="py-2 pr-3 font-medium text-right">Valid</th>
                  <th className="py-2 pr-3 font-medium">Endpoint / Unit</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {datasets.map((ds) => (
                  <tr
                    key={ds.id}
                    onClick={() => {
                      setSelectedId(ds.id);
                      loadDetails(ds.id);
                    }}
                    className={`cursor-pointer ${
                      selectedId === ds.id ? 'bg-cyan-50/50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-slate-900">{ds.name}</div>
                      <div className="text-[11px] font-mono text-slate-500">{ds.filename}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">
                      {ds.is_synthetic_demo ? 'Synthetic Demo' : 'User Upload'}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{ds.row_count}</td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{ds.valid_row_count}</td>
                    <td className="py-2.5 pr-3 font-mono text-slate-700">
                      {ds.endpoint || '—'} / {ds.unit || '—'}
                    </td>
                    <td className="py-2.5 pr-3 capitalize text-slate-700">{ds.status}</td>
                    <td className="py-2.5 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                      <a
                        href={`/api/datasets/${ds.id}/download?type=processed`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-100"
                        title="Download Processed CSV"
                      >
                        <Download className="w-3 h-3" />
                        <span>CSV</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDelete(ds.id)}
                        className="inline-flex items-center p-1 text-slate-400 hover:text-rose-700"
                        title="Delete Dataset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Dataset Diagnostics & Preprocessing */}
      {activeDataset && diagnostics && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Diagnostics & Preprocessing: {activeDataset.name}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {diagnostics.row_count} rows · {diagnostics.col_count} columns · {diagnostics.total_missing_cells} missing cells · {diagnostics.duplicate_count} duplicate keys · {diagnostics.invalid_smiles_count} invalid SMILES
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={targetEndpoint}
                onChange={(e) => setTargetEndpoint(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {Object.keys(diagnostics.endpoints).map((ep) => (
                  <option key={ep} value={ep}>
                    Endpoint: {ep} ({diagnostics.endpoints[ep]})
                  </option>
                ))}
              </select>
              <select
                value={targetUnit}
                onChange={(e) => setTargetUnit(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {Object.keys(diagnostics.units).map((u) => (
                  <option key={u} value={u}>
                    Unit: {u} ({diagnostics.units[u]})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={preprocessing}
                onClick={() => handlePreprocess(activeDataset.id)}
                className="px-4 py-2 rounded-lg bg-cyan-700 text-white text-xs font-medium hover:bg-cyan-800 disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{preprocessing ? 'Cleaning & Extracting...' : 'Clean & Preprocess'}</span>
              </button>
            </div>
          </div>

          {!diagnostics.endpoint_unit_compatible && diagnostics.compatibility_warning && (
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{diagnostics.compatibility_warning}</span>
            </div>
          )}

          {diagnostics.missing_columns.length === 0 ? (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>All 14 documented schema columns are present and validated.</span>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              Missing required columns: {diagnostics.missing_columns.join(', ')}
            </div>
          )}

          {/* Numeric Target Statistics */}
          {diagnostics.target_stats && (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Valid Numeric</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {diagnostics.target_stats.count}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Min</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {diagnostics.target_stats.min}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Median</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {diagnostics.target_stats.median}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Mean</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {diagnostics.target_stats.mean}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Std Dev</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {diagnostics.target_stats.std}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Max</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {diagnostics.target_stats.max}
                </div>
              </div>
            </div>
          )}

          {/* Preview Rows */}
          <div>
            <h4 className="text-xs font-semibold text-slate-700 mb-2">
              Data Preview (First 25 Rows)
            </h4>
            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-80">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                  <tr>
                    {diagnostics.columns.slice(0, 10).map((col) => (
                      <th key={col} className="py-2 px-3 font-mono font-medium text-slate-600 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {diagnostics.preview_rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {diagnostics.columns.slice(0, 10).map((col) => (
                        <td key={col} className="py-1.5 px-3 text-slate-700 whitespace-nowrap max-w-[180px] truncate">
                          {row[col] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
