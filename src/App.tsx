import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './layout/DashboardLayout';
import { DashboardPage } from './pages/DashboardPage';
import { NewTestPage } from './pages/NewTestPage';
import { TestHistoryPage } from './pages/TestHistoryPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectRequired } from './components/ProjectRequired';
import { TestDetailsPage } from './pages/TestDetailsPage';
import { SignInPage } from './pages/SignInPage';
import { useAuth } from './context/useAuth';

const RequireAuth = ({ children }: { children: ReactElement }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <p className="text-sm">Loading your workspace...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  return children;
};

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signin" element={isAuthenticated ? <Navigate to="/projects" replace /> : <SignInPage />} />
        <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/dashboard" element={<ProjectRequired><DashboardPage /></ProjectRequired>} />
          <Route path="/new-test" element={<ProjectRequired><NewTestPage /></ProjectRequired>} />
          <Route path="/history" element={<ProjectRequired><TestHistoryPage /></ProjectRequired>} />
          <Route path="/tests/:testId" element={<ProjectRequired><TestDetailsPage /></ProjectRequired>} />
          <Route path="/reports" element={<ProjectRequired><ReportsPage /></ProjectRequired>} />
          <Route path="/integrations" element={<Navigate to="/settings" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
