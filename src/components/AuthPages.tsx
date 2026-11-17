import React, { useState } from 'react';
import { FlaskConical, Lock, Mail, User as UserIcon, Building2, ArrowRight, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../api';
import type { PageId, User } from '../types';

interface AuthPagesProps {
  mode: 'login' | 'register';
  needsAdminSetup: boolean;
  onSwitchMode: (mode: PageId) => void;
  onAuthenticated: (user: User) => void;
}

export const AuthPages: React.FC<AuthPagesProps> = ({
  mode,
  needsAdminSetup,
  onSwitchMode,
  onAuthenticated,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [institution, setInstitution] = useState('');
  const [password, setPassword] = useState('');
  const [setupAsAdmin, setSetupAsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ user: User }>('/api/auth/demo-login', {
        method: 'POST',
      });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username,
          email,
          full_name: fullName,
          institution,
          password,
          setup_as_admin: setupAsAdmin,
        }),
      });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-12 bg-slate-50">
      {/* Left Dark Navy Research Overview Column */}
      <div className="lg:col-span-5 bg-[#0B1221] text-white p-8 lg:p-12 flex flex-col justify-between border-r border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-white" />
            </span>
            <span className="text-lg font-semibold tracking-tight">DrugEfficacy Insight</span>
          </div>

          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight text-white leading-tight mb-4 max-w-md">
            Predictive Analysis of Drug Efficacy Using Machine Learning
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed max-w-md mb-8">
            Computational research decision-support workspace for molecular SMILES validation, physicochemical descriptor extraction, leak-free QSAR regression modeling, and reproducible evaluation reporting.
          </p>

          <div className="space-y-4 border-t border-slate-800 pt-6 text-xs text-slate-300">
            <div>
              <div className="font-semibold text-cyan-400 mb-0.5">Cheminformatics Kernel</div>
              <div>SMILES canonicalization, Lipinski descriptors, Murcko scaffold signatures, and 2D structure depiction.</div>
            </div>
            <div>
              <div className="font-semibold text-violet-400 mb-0.5">Leak-Free ML Pipeline</div>
              <div>Scaffold-aware and group-aware splits with Ridge, Random Forest, Gradient Boosting, and Dummy baselines.</div>
            </div>
            <div>
              <div className="font-semibold text-slate-200 mb-0.5">Strict Research Scope</div>
              <div>Designed strictly for computational research and education. Not a medical device or prescribing system.</div>
            </div>
          </div>
        </div>

        <div className="pt-8 text-xs text-slate-400 font-mono">
          Local SQLite Persistence · Scrypt Auth · Role-Based Access Control
        </div>
      </div>

      {/* Right Clinical White Auth Form Column */}
      <div className="lg:col-span-7 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {mode === 'login' ? 'Researcher Sign In' : 'Create Researcher Account'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {mode === 'login'
                  ? 'Access datasets, trained models, and prediction reports.'
                  : 'Register an authorized account to run predictions and train models.'}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Email or Username
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="researcher@institute.org"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0B1221] text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
              >
                <span>{loading ? 'Signing in...' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-slate-400">Demonstration Mode</span>
                </div>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleDemoLogin}
                className="w-full py-2.5 px-4 rounded-lg border border-cyan-600/30 bg-cyan-50/70 text-cyan-900 text-xs font-semibold hover:bg-cyan-100/70 transition-colors"
              >
                Explore Demo Mode (Researcher Sandbox)
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Username
                  </label>
                  <div className="relative">
                    <UserIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="j_doe"
                      className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Dr. Jane Doe"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Research Email
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane.doe@university.edu"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Institution / Laboratory
                </label>
                <div className="relative">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="Computational Pharmacology Lab"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Password (minimum 8 characters)
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-600"
                  />
                </div>
              </div>

              {needsAdminSetup && (
                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-violet-50 border border-violet-200 text-xs text-violet-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={setupAsAdmin}
                    onChange={(e) => setSetupAsAdmin(e.target.checked)}
                    className="mt-0.5 rounded border-violet-400 text-violet-700 focus:ring-violet-500"
                  />
                  <span>
                    <strong>Initial Administrator Setup:</strong> No Administrator exists yet. Register this account as the initial system Administrator.
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-[#0B1221] text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
              >
                <span>{loading ? 'Creating account...' : 'Create Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-slate-200 text-center text-xs text-slate-600">
            {mode === 'login' ? (
              <>
                New researcher?{' '}
                <button
                  type="button"
                  onClick={() => onSwitchMode('register')}
                  className="font-semibold text-cyan-700 hover:text-cyan-800"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => onSwitchMode('login')}
                  className="font-semibold text-cyan-700 hover:text-cyan-800"
                >
                  Sign in here
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
