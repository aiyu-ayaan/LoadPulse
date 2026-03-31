import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './layout/DashboardLayout';
import { DashboardPage } from './pages/DashboardPage';
import { NewTestPage } from './pages/NewTestPage';
import { TestHistoryPage } from './pages/TestHistoryPage';
import { ReportsPage } from './pages/ReportsPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectRequired } from './components/ProjectRequired';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/dashboard" element={<ProjectRequired><DashboardPage /></ProjectRequired>} />
          <Route path="/new-test" element={<ProjectRequired><NewTestPage /></ProjectRequired>} />
          <Route path="/history" element={<ProjectRequired><TestHistoryPage /></ProjectRequired>} />
          <Route path="/reports" element={<ProjectRequired><ReportsPage /></ProjectRequired>} />
          <Route path="/integrations" element={<ProjectRequired><IntegrationsPage /></ProjectRequired>} />
          <Route path="/settings" element={<ProjectRequired><SettingsPage /></ProjectRequired>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
