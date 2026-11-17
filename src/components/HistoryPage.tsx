import React, { useEffect, useState } from 'react';
import { Download, Eye, Search, Trash2, X } from 'lucide-react';
import Papa from 'papaparse';
import { apiFetch } from '../api';
import type { PredictionRecord, User } from '../types';

interface HistoryPageProps {
  user: User;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ user }) => {
  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [search, setSearch] = useState('');
  const [endpointFilter, setEndpointFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PredictionRecord | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (endpointFilter) qs.set('endpoint', endpointFilter);
      if (sort) qs.set('sort', sort);
      const res = await apiFetch<{ predictions: PredictionRecord[] }>(
        `/api/predictions?${qs.toString()}`
      );
      setPredictions(res.predictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prediction history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [endpointFilter, sort]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadHistory();
  };

  const handleViewDetails = async (id: number) => {
    try {
      const res = await apiFetch<{ prediction: PredictionRecord }>(`/api/predictions/${id}`);
      setDetail(res.prediction);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load details.');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/predictions/${id}`, { method: 'DELETE' });
      setPredictions((prev) => prev.filter((p) => p.id !== id));
      if (detail?.id === id) setDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete record.');
    }
  };

  const handleExportCsv = () => {
    const csv = Papa.unparse(
      predictions.map((p) => ({
        prediction_id: p.prediction_code,
        compound_name: p.compound_name,
        canonical_smiles: p.canonical_smiles,
        endpoint: p.endpoint,
        predicted_value: p.predicted_value,
        unit: p.predicted_unit,
        model_version: p.model_version,
        in_domain: Boolean(p.in_domain),
        user: p.user_name || 'Researcher',
        timestamp: p.created_at,
      }))
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DrugEfficacy_Prediction_History_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const endpoints = Array.from(new Set(predictions.map((p) => p.endpoint)));

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID, compound, SMILES, target..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>
          <select
            value={endpointFilter}
            onChange={(e) => setEndpointFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Endpoints</option>
            {endpoints.map((ep) => (
              <option key={ep} value={ep}>
                {ep}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="value_desc">Highest Estimate</option>
            <option value="value_asc">Lowest Estimate</option>
          </select>
          <button
            type="submit"
            className="px-3.5 py-2 rounded-lg bg-[#0B1221] text-white text-xs font-medium hover:bg-slate-800"
          >
            Search
          </button>
        </form>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={predictions.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* History Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        {loading ? (
          <div className="h-40 animate-pulse bg-slate-100 rounded-lg" />
        ) : predictions.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No matching prediction records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Prediction ID</th>
                  <th className="py-2.5 pr-3 font-medium">Compound</th>
                  <th className="py-2.5 pr-3 font-medium">Endpoint</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Predicted Value</th>
                  <th className="py-2.5 pr-3 font-medium">Model Version</th>
                  <th className="py-2.5 pr-3 font-medium">Researcher</th>
                  <th className="py-2.5 pr-3 font-medium">Date & Time</th>
                  <th className="py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {predictions.map((p) => {
                  const canDelete =
                    user.role === 'Administrator' || p.user_id === user.id;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-3 font-mono text-slate-900">
                        {p.prediction_code}
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">
                        {p.compound_name}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{p.endpoint}</td>
                      <td className="py-2.5 pr-3 text-right font-mono tabular-nums font-semibold text-cyan-700">
                        {p.predicted_value.toFixed(4)} {p.predicted_unit}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-slate-600">
                        {p.model_version}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">
                        {p.user_name || 'Researcher'}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-slate-500">
                        {p.created_at}
                      </td>
                      <td className="py-2.5 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => handleViewDetails(p.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-100"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>
                        <a
                          href={`/api/reports/predictions/${p.id}?format=pdf`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-100"
                        >
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                        </a>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            className="inline-flex items-center p-1 text-slate-400 hover:text-rose-700"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-mono text-slate-500">{detail.prediction_code}</div>
                <h3 className="text-lg font-semibold text-slate-900">{detail.compound_name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detail.svg && (
              <div className="flex justify-center p-3 border border-slate-200 rounded-lg bg-slate-50">
                <div dangerouslySetInnerHTML={{ __html: detail.svg }} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">Original SMILES:</span>
                <div className="font-mono break-all text-slate-900 mt-0.5">{detail.original_smiles}</div>
              </div>
              <div>
                <span className="text-slate-500">Canonical SMILES:</span>
                <div className="font-mono break-all text-cyan-800 mt-0.5">{detail.canonical_smiles}</div>
              </div>
              <div>
                <span className="text-slate-500">Predicted Endpoint:</span>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {detail.predicted_value.toFixed(4)} {detail.predicted_unit} ({detail.endpoint})
                </div>
              </div>
              <div>
                <span className="text-slate-500">Model & Metrics:</span>
                <div className="font-mono text-slate-900 mt-0.5">
                  {detail.model_name} ({detail.model_version}) · R²={detail.r2}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <a
                href={`/api/reports/predictions/${detail.id}?format=pdf`}
                className="px-4 py-2 rounded-lg bg-[#0B1221] text-white text-xs font-medium hover:bg-slate-800"
              >
                Download PDF Report
              </a>
              <a
                href={`/api/reports/predictions/${detail.id}?format=csv`}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50"
              >
                Download CSV
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
