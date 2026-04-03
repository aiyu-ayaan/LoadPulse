import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './layout/DashboardLayout';
import { DashboardPage } from './pages/DashboardPage';
import { NewTestPage } from './pages/NewTestPage';
import { TestHistoryPage } from './pages/TestHistoryPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectRequired } from './components/ProjectRequired';
import { TestDetailsPage } from './pages/TestDetailsPage';
import { SignInPage } from './pages/SignInPage';
import { AdminSignInPage } from './pages/AdminSignInPage';
import { AdminConsoleLayout } from './pages/admin/AdminConsoleLayout';
import { AdminAccountsPage } from './pages/admin/AdminAccountsPage';
import { AdminQueuePage } from './pages/admin/AdminQueuePage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { AdminAboutPage } from './pages/admin/AdminAboutPage';
import { NotFoundPage } from './pages/NotFoundPage';
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

const RequireAdmin = ({ children }: { children: ReactElement }) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <p className="text-sm">Loading admin workspace...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/signin" replace />;
  }

  if (!user?.isAdmin) {
    return <Navigate to="/admin/signin" replace />;
  }

  return children;
};

function App() {
  const { isAuthenticated, user } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signin" element={isAuthenticated ? <Navigate to="/projects" replace /> : <SignInPage />} />
        <Route
          path="/admin/signin"
          element={
            isAuthenticated && user?.isAdmin ? <Navigate to="/admin/accounts" replace /> : <AdminSignInPage />
          }
        />
        <Route path="/admin" element={<RequireAdmin><AdminConsoleLayout /></RequireAdmin>}>
          <Route index element={<Navigate to="/admin/accounts" replace />} />
          <Route path="accounts" element={<AdminAccountsPage />} />
          <Route path="queue" element={<AdminQueuePage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="about" element={<AdminAboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route element={<RequireAuth><DashboardLayout /></RequireAuth>}>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/projects/:projectId/dashboard" element={<ProjectRequired><DashboardPage /></ProjectRequired>} />
          <Route path="/projects/:projectId/new-test" element={<ProjectRequired><NewTestPage /></ProjectRequired>} />
          <Route path="/projects/:projectId/history" element={<ProjectRequired><TestHistoryPage /></ProjectRequired>} />
          <Route path="/projects/:projectId/tests/:testId" element={<ProjectRequired><TestDetailsPage /></ProjectRequired>} />
          <Route path="/projects/:projectId/reports" element={<ProjectRequired><ReportsPage /></ProjectRequired>} />
          <Route path="/projects/:projectId/integrations" element={<ProjectRequired><IntegrationsPage /></ProjectRequired>} />
          <Route path="/projects/:projectId/settings" element={<ProjectRequired><SettingsPage /></ProjectRequired>} />
          <Route path="/integrations" element={<Navigate to="/projects" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
