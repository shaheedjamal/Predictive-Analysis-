import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';
import { AuthPages } from './components/AuthPages';
import { DashboardPage } from './components/DashboardPage';
import { DatasetsPage } from './components/DatasetsPage';
import { EvaluationPage } from './components/EvaluationPage';
import { HistoryPage } from './components/HistoryPage';
import { Layout } from './components/Layout';
import { MolecularAnalysisPage } from './components/MolecularAnalysisPage';
import { PredictionPage } from './components/PredictionPage';
import { AdminPage, ProfilePage } from './components/ProfileAndAdminPages';
import { ReportsPage } from './components/ReportsPage';
import { TrainingPage } from './components/TrainingPage';
import type { PageId, User } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [page, setPage] = useState<PageId>('dashboard');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [demoModeActive, setDemoModeActive] = useState(true);

  useEffect(() => {
    apiFetch<{
      authenticated: boolean;
      user: User | null;
      needs_admin_setup: boolean;
    }>('/api/auth/me')
      .then((res) => {
        setNeedsAdminSetup(res.needs_admin_setup);
        if (res.authenticated && res.user) {
          setUser(res.user);
        }
      })
      .catch(() => {})
      .finally(() => setCheckingAuth(false));
  }, []);

  const handleAuthenticated = useCallback((authenticatedUser: User) => {
    setUser(authenticatedUser);
    setPage('dashboard');
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout error
    }
    setUser(null);
    setAuthMode('login');
  }, []);

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0B1221] text-slate-300 text-sm">
        Initializing DrugEfficacy Insight workspace...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthPages
        mode={authMode}
        needsAdminSetup={needsAdminSetup}
        onSwitchMode={(next) => setAuthMode(next === 'register' ? 'register' : 'login')}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const effectivePage: PageId =
    page === 'admin' && user.role !== 'Administrator' ? 'dashboard' : page;

  return (
    <Layout
      user={user}
      activePage={effectivePage}
      onNavigate={setPage}
      onLogout={handleLogout}
      demoModeActive={demoModeActive}
    >
      {effectivePage === 'dashboard' && (
        <DashboardPage onNavigate={setPage} onDemoStatus={setDemoModeActive} />
      )}
      {effectivePage === 'predict' && <PredictionPage />}
      {effectivePage === 'molecular' && <MolecularAnalysisPage />}
      {effectivePage === 'datasets' && <DatasetsPage />}
      {effectivePage === 'training' && <TrainingPage />}
      {effectivePage === 'evaluation' && <EvaluationPage />}
      {effectivePage === 'history' && <HistoryPage user={user} />}
      {effectivePage === 'reports' && <ReportsPage />}
      {effectivePage === 'profile' && (
        <ProfilePage user={user} onUserUpdated={setUser} />
      )}
      {effectivePage === 'admin' && user.role === 'Administrator' && <AdminPage />}
    </Layout>
  );
}
