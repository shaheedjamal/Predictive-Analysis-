import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, Trash2 } from 'lucide-react';
import { apiFetch } from '../api';
import type { DatasetRecord, ModelRecord, User } from '../types';

interface ProfilePageProps {
  user: User;
  onUserUpdated: (user: User) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ user, onUserUpdated }) => {
  const [fullName, setFullName] = useState(user.full_name);
  const [institution, setInstitution] = useState(user.institution || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch<{ user: User }>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          full_name: fullName,
          institution,
          current_password: currentPassword || undefined,
          new_password: newPassword || undefined,
        }),
      });
      onUserUpdated(res.user);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl bg-white border border-slate-200 rounded-xl p-6 space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Researcher Profile & Credentials</h2>
        <p className="text-xs text-slate-500">
          Account: <span className="font-mono">{user.username}</span> · Role: {user.role} · Email: {user.email}
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{message}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Institution / Laboratory</label>
          <input
            type="text"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>

        {!user.is_demo && (
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <h3 className="text-xs font-semibold text-slate-700">Change Password (Optional)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 8 chars)"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-[#0B1221] text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
};

interface AuditLogRow {
  id: number;
  username: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: string | null;
  created_at: string;
}

export const AdminPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadAll = async () => {
    try {
      const [uRes, dRes, mRes, lRes] = await Promise.all([
        apiFetch<{ users: User[] }>('/api/admin/users'),
        apiFetch<{ datasets: DatasetRecord[] }>('/api/datasets'),
        apiFetch<{ models: ModelRecord[] }>('/api/models'),
        apiFetch<{ logs: AuditLogRow[] }>('/api/admin/audit-logs'),
      ]);
      setUsers(uRes.users);
      setDatasets(dRes.datasets);
      setModels(mRes.models);
      setLogs(lRes.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin access denied.');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleToggleRole = async (u: User) => {
    const nextRole = u.role === 'Administrator' ? 'Researcher' : 'Administrator';
    await apiFetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: nextRole }),
    });
    await loadAll();
  };

  const handleToggleActive = async (u: User) => {
    await apiFetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: u.is_active ? 0 : 1 }),
    });
    await loadAll();
  };

  const handleActivateModel = async (id: number) => {
    await apiFetch(`/api/models/${id}/activate`, { method: 'PATCH' });
    await loadAll();
  };

  const handleDeleteModel = async (id: number) => {
    try {
      await apiFetch(`/api/models/${id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot delete model.');
    }
  };

  const handleDeleteDataset = async (id: number) => {
    await apiFetch(`/api/datasets/${id}`, { method: 'DELETE' });
    await loadAll();
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* User Management */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-violet-700" />
          <h2 className="text-base font-semibold text-slate-900">User & Role Management</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Email / Username</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-3 font-medium text-slate-900">{u.full_name}</td>
                  <td className="py-2.5 pr-3 font-mono text-slate-600">
                    {u.email} ({u.username})
                  </td>
                  <td className="py-2.5 pr-3 text-slate-700">{u.role}</td>
                  <td className="py-2.5 pr-3 text-slate-700">
                    {u.is_active ? 'Active' : 'Suspended'}
                  </td>
                  <td className="py-2.5 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => handleToggleRole(u)}
                      className="px-2.5 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      Switch Role
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(u)}
                      className="px-2.5 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Model & Dataset Governance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Model Version Governance</h3>
          <div className="divide-y divide-slate-100 text-xs">
            {models.map((m) => (
              <div key={m.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">{m.name}</div>
                  <div className="font-mono text-slate-500">
                    {m.version} · R²={m.r2} · {m.is_active ? 'ACTIVE' : 'Standby'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!m.is_active && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleActivateModel(m.id)}
                        className="px-2 py-1 rounded border border-cyan-600/30 text-cyan-800 hover:bg-cyan-50"
                      >
                        Activate
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteModel(m.id)}
                        className="p-1 text-slate-400 hover:text-rose-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Dataset Governance</h3>
          <div className="divide-y divide-slate-100 text-xs">
            {datasets.map((d) => (
              <div key={d.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">{d.name}</div>
                  <div className="font-mono text-slate-500">
                    {d.row_count} rows · {d.status} · {d.is_synthetic_demo ? 'Demo' : 'User'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteDataset(d.id)}
                  className="p-1 text-slate-400 hover:text-rose-700 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Security Audit Logs */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Security & Research Audit Log</h3>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Timestamp</th>
                <th className="py-2 pr-3 font-medium">User</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium">Resource</th>
                <th className="py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{l.created_at}</td>
                  <td className="py-2 pr-3 text-slate-900">{l.username}</td>
                  <td className="py-2 pr-3 text-cyan-800">{l.action}</td>
                  <td className="py-2 pr-3 text-slate-700">
                    {l.resource_type}
                    {l.resource_id ? `:${l.resource_id}` : ''}
                  </td>
                  <td className="py-2 text-slate-600">{l.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
