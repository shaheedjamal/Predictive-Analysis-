import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { apiFetch } from '../api';
import type { PageId } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

interface DashboardResponse {
  summary: {
    total_users: number;
    total_datasets: number;
    total_predictions: number;
    available_models: number;
    latest_training_status: string;
    latest_model_name: string | null;
    active_model: {
      id: number;
      name: string;
      algorithm: string;
      version: string;
      r2: number;
      rmse: number;
      mae: number;
      split_method: string;
      is_demo: number;
    } | null;
  };
  charts: {
    prediction_activity: { day: string; count: number }[];
    dataset_distribution: { label: string; count: number }[];
    model_comparison: {
      id: number;
      name: string;
      algorithm: string;
      version: string;
      mae: number;
      rmse: number;
      r2: number;
      is_active: number;
      is_demo: number;
    }[];
    response_distribution: { bin: string; count: number }[];
  };
  recent_predictions: {
    id: number;
    prediction_code: string;
    compound_name: string;
    endpoint: string;
    predicted_value: number;
    predicted_unit: string;
    model_version: string;
    in_domain: number;
    is_demo: number;
    created_at: string;
  }[];
  recent_activities: {
    id: number;
    username: string;
    action: string;
    resource_type: string;
    resource_id: string | null;
    details: string | null;
    created_at: string;
  }[];
  system_status: {
    database_engine: string;
    cheminformatics_engine: string;
    ml_pipeline: string;
    demo_mode_active: boolean;
    synthetic_datasets: number;
    user_datasets: number;
  };
}

interface DashboardPageProps {
  onNavigate: (page: PageId) => void;
  onDemoStatus: (isDemo: boolean) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigate,
  onDemoStatus,
}) => {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<DashboardResponse>('/api/dashboard/stats')
      .then((res) => {
        if (!mounted) return;
        setData(res);
        onDemoStatus(res.system_status.demo_mode_active);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [onDemoStatus]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-white border border-rose-200 rounded-xl text-sm text-rose-700">
        {error || 'Unable to load dashboard metrics.'}
      </div>
    );
  }

  const activityData = {
    labels: data.charts.prediction_activity.map((p) => p.day),
    datasets: [
      {
        label: 'Predictions Logged',
        data: data.charts.prediction_activity.map((p) => p.count),
        borderColor: '#0891B2',
        backgroundColor: 'rgba(6, 182, 212, 0.14)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
      },
    ],
  };

  const datasetDistData = {
    labels: data.charts.dataset_distribution.map((d) => d.label),
    datasets: [
      {
        data: data.charts.dataset_distribution.map((d) => d.count),
        backgroundColor: ['#0891B2', '#7C3AED', '#0F172A', '#6366F1', '#14B8A6'],
        borderWidth: 1,
        borderColor: '#FFFFFF',
      },
    ],
  };

  const modelCompData = {
    labels: data.charts.model_comparison.map((m) =>
      m.algorithm.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    ),
    datasets: [
      {
        label: 'R² Score',
        data: data.charts.model_comparison.map((m) => m.r2),
        backgroundColor: '#0891B2',
        borderRadius: 4,
      },
      {
        label: 'RMSE',
        data: data.charts.model_comparison.map((m) => m.rmse),
        backgroundColor: '#7C3AED',
        borderRadius: 4,
      },
    ],
  };

  const responseHistData = {
    labels: data.charts.response_distribution.map((r) => r.bin),
    datasets: [
      {
        label: 'Records',
        data: data.charts.response_distribution.map((r) => r.count),
        backgroundColor: '#0F172A',
        borderRadius: 4,
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Summary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Registered Researchers</div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {data.summary.total_users}
          </div>
          <div className="mt-1 text-xs text-slate-500">SQLite user registry</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Uploaded Datasets</div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {data.summary.total_datasets}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {data.system_status.user_datasets} curated · {data.system_status.synthetic_datasets} demo
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Prediction Requests</div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-cyan-700">
            {data.summary.total_predictions}
          </div>
          <div className="mt-1 text-xs text-slate-500">Persisted estimates</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Available ML Models</div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-violet-700">
            {data.summary.available_models}
          </div>
          <div className="mt-1 text-xs text-slate-500">Trained model artifacts</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Latest Training Status</div>
          <div className="mt-2 text-lg font-semibold text-slate-900 capitalize truncate">
            {data.summary.latest_training_status}
          </div>
          <div className="mt-1 text-xs text-slate-500 truncate">
            {data.summary.latest_model_name || 'No model trained'}
          </div>
        </div>
      </div>

      {/* Interactive Chart.js Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Prediction Activity</h2>
              <p className="text-xs text-slate-500">Daily prediction requests stored in database</p>
            </div>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs font-medium text-cyan-700 hover:text-cyan-800"
            >
              View History
            </button>
          </div>
          <div className="h-60">
            <Line
              data={activityData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
              }}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Dataset Assay Distribution</h2>
              <p className="text-xs text-slate-500">Records grouped by experimental assay type</p>
            </div>
            <button
              onClick={() => onNavigate('datasets')}
              className="text-xs font-medium text-cyan-700 hover:text-cyan-800"
            >
              Manage Datasets
            </button>
          </div>
          <div className="h-60 flex items-center justify-center">
            <Doughnut
              data={datasetDistData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } },
              }}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Model Comparison (Measured Held-Out Metrics)</h2>
              <p className="text-xs text-slate-500">R² and RMSE across trained model versions</p>
            </div>
            <button
              onClick={() => onNavigate('evaluation')}
              className="text-xs font-medium text-violet-700 hover:text-violet-800"
            >
              Full Evaluation
            </button>
          </div>
          <div className="h-60">
            <Bar
              data={modelCompData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
              }}
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Response Endpoint Distribution</h2>
              <p className="text-xs text-slate-500">Standardized target distribution across measurements</p>
            </div>
            <button
              onClick={() => onNavigate('training')}
              className="text-xs font-medium text-cyan-700 hover:text-cyan-800"
            >
              Train Models
            </button>
          </div>
          <div className="h-60">
            <Bar
              data={responseHistData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom Operational Tables & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Recent Predictions</h2>
            <button
              onClick={() => onNavigate('predict')}
              className="text-xs font-medium text-cyan-700 hover:text-cyan-800"
            >
              Run New Prediction
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Prediction ID</th>
                  <th className="py-2.5 pr-3 font-medium">Compound</th>
                  <th className="py-2.5 pr-3 font-medium">Endpoint</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Estimate</th>
                  <th className="py-2.5 font-medium text-right">Domain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent_predictions.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-800">
                      {p.prediction_code}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-900 font-medium">{p.compound_name}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{p.endpoint}</td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-900">
                      {p.predicted_value.toFixed(3)} {p.predicted_unit}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {p.in_domain ? 'In Domain' : 'Warning'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Active Model Status</h2>
            {data.summary.active_model ? (
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="font-semibold text-slate-900">
                  {data.summary.active_model.name}
                </div>
                <div>
                  Version {data.summary.active_model.version} · Split: {data.summary.active_model.split_method}
                </div>
                <div className="font-mono tabular-nums text-slate-800">
                  R² {data.summary.active_model.r2} · RMSE {data.summary.active_model.rmse} · MAE {data.summary.active_model.mae}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">No active model selected.</div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">System Configuration</h2>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Database</dt>
                <dd className="text-slate-900 font-medium">{data.system_status.database_engine}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Chemistry</dt>
                <dd className="text-slate-900 font-medium text-right">OpenChemLib</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Mode</dt>
                <dd className="text-slate-900 font-medium">
                  {data.system_status.demo_mode_active ? 'Demo Sandbox' : 'Curated Research'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">Recent Activity</h2>
            <ul className="space-y-2 text-xs text-slate-600">
              {data.recent_activities.slice(0, 4).map((act) => (
                <li key={act.id} className="truncate">
                  <span className="font-medium text-slate-800">{act.username}</span> ·{' '}
                  <span className="font-mono">{act.action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
