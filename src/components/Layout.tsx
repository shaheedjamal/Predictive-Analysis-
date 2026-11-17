import React, { useState } from 'react';
import {
  Activity,
  Atom,
  BarChart3,
  Cpu,
  Database,
  FileSpreadsheet,
  FlaskConical,
  History,
  LogOut,
  Menu,
  ShieldCheck,
  User as UserIcon,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { PageId, User } from '../types';

interface LayoutProps {
  user: User;
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  onLogout: () => void;
  demoModeActive: boolean;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: PageId; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'predict', label: 'Drug Prediction', icon: FlaskConical },
  { id: 'molecular', label: 'Molecular Analysis', icon: Atom },
  { id: 'datasets', label: 'Dataset Management', icon: Database },
  { id: 'training', label: 'Model Training', icon: Cpu },
  { id: 'evaluation', label: 'Model Evaluation', icon: BarChart3 },
  { id: 'history', label: 'Prediction History', icon: History },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
  { id: 'profile', label: 'User Profile', icon: UserIcon },
  { id: 'admin', label: 'Admin Dashboard', icon: ShieldCheck, adminOnly: true },
];

const PAGE_TITLES: Record<PageId, string> = {
  login: 'Sign In',
  register: 'Register',
  dashboard: 'Research Overview',
  predict: 'Drug Response Prediction',
  molecular: 'Molecular Structure & Descriptors',
  datasets: 'Dataset Management & Preprocessing',
  training: 'Model Training Pipeline',
  evaluation: 'Model Evaluation & Diagnostics',
  history: 'Prediction History',
  reports: 'Research Reports & Exports',
  profile: 'Researcher Profile',
  admin: 'System Administration',
};

export const Layout: React.FC<LayoutProps> = ({
  user,
  activePage,
  onNavigate,
  onLogout,
  demoModeActive,
  children,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user.role === 'Administrator'
  );

  const handleSelect = (page: PageId) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Dark Navy Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0B1221] text-slate-100 flex flex-col border-r border-slate-800 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-800/80 shrink-0">
          <button
            onClick={() => handleSelect('dashboard')}
            className="flex items-center gap-2.5 text-left focus:outline-none"
          >
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shrink-0">
              <FlaskConical className="w-4 h-4 text-white" />
            </span>
            <span className="font-semibold tracking-tight text-white text-base whitespace-nowrap">
              DrugEfficacy Insight
            </span>
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/80 space-y-3 shrink-0">
          <div className="text-xs text-slate-400 leading-relaxed">
            <div className="font-medium text-slate-200 truncate">{user.full_name}</div>
            <div className="truncate">{user.role} · {user.username}</div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-800 hover:text-white border border-slate-700 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (Strict 3-zone simplicity) */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-slate-900 truncate">
              {PAGE_TITLES[activePage]}
            </h1>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-500 whitespace-nowrap">
              {user.institution} · {user.role}
            </span>
            <button
              onClick={() => onNavigate('predict')}
              className="px-4 py-2 rounded-lg bg-[#0B1221] text-white text-xs font-medium hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              New Prediction
            </button>
          </div>
        </header>

        {/* Visible DEMO MODE & Research Disclaimer Banner */}
        {demoModeActive && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>DEMO MODE ACTIVE:</strong> Synthetic demonstration data and models are active. Estimates from synthetic datasets do not predict real pharmacological efficacy. Upload curated experimental CSV data in Dataset Management for empirical research.
              </span>
            </div>
            <button
              onClick={() => onNavigate('datasets')}
              className="font-semibold underline text-amber-900 hover:text-amber-700 whitespace-nowrap"
            >
              Upload Curated CSV
            </button>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white px-4 lg:px-8 py-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
          <span>
            DrugEfficacy Insight · Computational QSAR Research & Educational Prototype Only (Not a Medical Device)
          </span>
          <span className="font-mono tabular-nums">
            SQLite Local Store · OpenChemLib Descriptor Engine
          </span>
        </footer>
      </div>
    </div>
  );
};
