import { useState } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { ClipboardCheck, Home, Menu } from 'lucide-react';
import './App.css';

import { DashboardHomePage } from './pages/DashboardHomePage';
import { SupervisorApprovalPage } from './pages/SupervisorApprovalPage';
import { EnrolmentDetailsPage } from './pages/EnrolmentDetailsPage';

function SideNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={`side-nav${collapsed ? ' collapsed' : ''}`}>
      <button className="side-nav-toggle" type="button" onClick={onToggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
        <Menu size={24} />
      </button>

      <nav className="side-nav-links" aria-label="Primary">
        <NavLink to="/dashboard-home" className={({ isActive }) => `side-nav-link${isActive ? ' active' : ''}`}>
          <Home size={22} />
          {!collapsed && <span>Dashboard</span>}
        </NavLink>

        <NavLink to="/supervisor-approval" className={({ isActive }) => `side-nav-link${isActive ? ' active' : ''}`}>
          <ClipboardCheck size={22} />
          {!collapsed && <span>Supervisor Approval</span>}
        </NavLink>
      </nav>
    </aside>
  );
}

function AppShell() {
  const [navCollapsed, setNavCollapsed] = useState(false);

  return (
    <div className="app-shell">
      <SideNav collapsed={navCollapsed} onToggle={() => setNavCollapsed(prev => !prev)} />
      <main className="app-shell-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard-home" replace />} />
          <Route path="/dashboard-home" element={<DashboardHomePage />} />
          <Route path="/enrolment/:enrolmentId" element={<EnrolmentDetailsPage />} />
          <Route path="/supervisor-approval" element={<SupervisorApprovalPage />} />
          <Route path="/calculation" element={<Navigate to="/supervisor-approval" replace />} />
          <Route path="*" element={<Navigate to="/dashboard-home" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
