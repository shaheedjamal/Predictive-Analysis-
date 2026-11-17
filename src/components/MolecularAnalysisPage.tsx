import React, { useState } from 'react';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import { Atom, Plus, Trash2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../api';
import type { MolecularDescriptors } from '../types';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const PRESETS = [
  { label: 'Aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { label: 'Caffeine', smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C' },
  { label: 'Ibuprofen', smiles: 'CC(C)Cc1ccc(C(C)C(=O)O)cc1' },
  { label: 'Erlotinib', smiles: 'COc1cc2ncnc(Nc3cccc(C#C)c3)c2cc1OCCOC' },
  { label: 'Imatinib', smiles: 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1' },
];

export const MolecularAnalysisPage: React.FC = () => {
  const [smilesInput, setSmilesInput] = useState('CC(=O)Oc1ccccc1C(=O)O');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<MolecularDescriptors | null>(null);
  const [compared, setCompared] = useState<MolecularDescriptors[]>([]);

  const handleAnalyze = async (targetSmiles?: string) => {
    const query = targetSmiles ?? smilesInput;
    setError(null);
    setAnalyzing(true);
    try {
      const res = await apiFetch<{ valid: boolean; descriptors: MolecularDescriptors }>(
        '/api/molecules/analyze',
        {
          method: 'POST',
          body: JSON.stringify({ smiles: query }),
        }
      );
      setCurrent(res.descriptors);
    } catch (err) {
      setCurrent(null);
      setError(err instanceof Error ? err.message : 'SMILES validation failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddCompare = () => {
    if (!current) return;
    if (compared.some((c) => c.canonical_smiles === current.canonical_smiles)) return;
    setCompared((prev) => [...prev.slice(-3), current]);
  };

  // Normalized Lipinski/Veber radar axes (0..100 scale relative to drug-like upper thresholds)
  const radarData = current
    ? {
        labels: [
          'MW (/500 Da)',
          'LogP (/5)',
          'TPSA (/140 Å²)',
          'HBD (/5)',
          'HBA (/10)',
          'RotBonds (/10)',
          'Rings (/6)',
        ],
        datasets: [
          {
            label: current.molecular_formula,
            data: [
              Math.min(120, (current.molecular_weight / 500) * 100),
              Math.min(120, Math.max(0, (current.logp / 5) * 100)),
              Math.min(120, (current.tpsa / 140) * 100),
              Math.min(120, (current.hbd / 5) * 100),
              Math.min(120, (current.hba / 10) * 100),
              Math.min(120, (current.rotatable_bonds / 10) * 100),
              Math.min(120, (current.ring_count / 6) * 100),
            ],
            backgroundColor: 'rgba(6, 182, 212, 0.2)',
            borderColor: '#0891B2',
            borderWidth: 2,
          },
        ],
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Input Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              SMILES Validation & Descriptor Workbench
            </h2>
            <p className="text-xs text-slate-500">
              Validates molecular connectivity, separates original and standardized canonical SMILES, and computes physicochemical descriptors.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setSmilesInput(p.smiles);
                  handleAnalyze(p.smiles);
                }}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={smilesInput}
            onChange={(e) => setSmilesInput(e.target.value)}
            placeholder="Enter SMILES string (e.g. CC(=O)Oc1ccccc1C(=O)O)"
            className="flex-1 px-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-600"
          />
          <button
            type="button"
            disabled={analyzing}
            onClick={() => handleAnalyze()}
            className="px-5 py-2.5 rounded-lg bg-[#0B1221] text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Atom className="w-4 h-4" />
            <span>{analyzing ? 'Analyzing...' : 'Validate & Compute'}</span>
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {current && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 2D Structure & Canonicalization */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">2D Structure Depiction</h3>
              <button
                type="button"
                onClick={handleAddCompare}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Comparison</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-lg p-4 flex items-center justify-center bg-white min-h-[210px]">
              <div dangerouslySetInnerHTML={{ __html: current.svg }} />
            </div>

            <dl className="space-y-2 text-xs">
              <div>
                <dt className="text-slate-500">Original Input SMILES</dt>
                <dd className="font-mono text-slate-900 break-all bg-slate-50 p-2 rounded border border-slate-200 mt-0.5">
                  {current.original_smiles}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Standardized Canonical SMILES</dt>
                <dd className="font-mono text-cyan-900 break-all bg-cyan-50/50 p-2 rounded border border-cyan-200 mt-0.5">
                  {current.canonical_smiles}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Extracted Ring Scaffold Signature</dt>
                <dd className="font-mono text-slate-700 break-all bg-slate-50 p-2 rounded border border-slate-200 mt-0.5">
                  {current.scaffold_smiles}
                </dd>
              </div>
            </dl>
          </div>

          {/* Descriptors & Radar Chart */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Physicochemical Descriptor Profile
                </h3>
                <p className="text-xs text-slate-500">
                  Formula: <span className="font-mono">{current.molecular_formula}</span> · Heavy Atoms: {current.heavy_atoms} · Aromatic Atoms: {current.aromatic_atoms}
                </p>
              </div>
              <div className="text-xs text-right">
                <div className="font-medium text-slate-900">
                  Lipinski Violations: <span className="font-mono">{current.lipinski_violations}</span>
                </div>
                <div className="text-slate-500">
                  Veber Oral Bioavailability: {current.veber_compliant ? 'Compliant' : 'Exceeded'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Molecular Weight</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {current.molecular_weight} Da
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">LogP</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {current.logp}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">TPSA</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {current.tpsa} Å²
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">H-Bond Donors</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {current.hbd}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">H-Bond Acceptors</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {current.hba}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Rotatable Bonds</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {current.rotatable_bonds}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Ring Count</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {current.ring_count}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Heavy Atoms</div>
                <div className="text-base font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {current.heavy_atoms}
                </div>
              </div>
            </div>

            {radarData && (
              <div className="h-64">
                <Radar
                  data={radarData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      r: {
                        beginAtZero: true,
                        suggestedMax: 100,
                        ticks: { display: false },
                      },
                    },
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Side-by-side comparison tray */}
      {compared.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Descriptor Comparison Table
            </h3>
            <button
              type="button"
              onClick={() => setCompared([])}
              className="text-xs text-slate-500 hover:text-rose-700 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Comparison</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Formula</th>
                  <th className="py-2 pr-3 font-medium">Canonical SMILES</th>
                  <th className="py-2 pr-3 font-medium text-right">MW</th>
                  <th className="py-2 pr-3 font-medium text-right">LogP</th>
                  <th className="py-2 pr-3 font-medium text-right">TPSA</th>
                  <th className="py-2 pr-3 font-medium text-right">HBD/HBA</th>
                  <th className="py-2 pr-3 font-medium text-right">RotB</th>
                  <th className="py-2 font-medium text-right">Rings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {compared.map((c) => (
                  <tr key={c.canonical_smiles}>
                    <td className="py-2 pr-3 font-semibold text-slate-900">{c.molecular_formula}</td>
                    <td className="py-2 pr-3 text-slate-600 max-w-xs truncate">{c.canonical_smiles}</td>
                    <td className="py-2 pr-3 text-right">{c.molecular_weight}</td>
                    <td className="py-2 pr-3 text-right">{c.logp}</td>
                    <td className="py-2 pr-3 text-right">{c.tpsa}</td>
                    <td className="py-2 pr-3 text-right">
                      {c.hbd}/{c.hba}
                    </td>
                    <td className="py-2 pr-3 text-right">{c.rotatable_bonds}</td>
                    <td className="py-2 text-right">{c.ring_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
