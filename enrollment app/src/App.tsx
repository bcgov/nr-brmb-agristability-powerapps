import { useState } from 'react';
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { ClipboardCheck, ExternalLink, Home, LayoutDashboard, Menu } from 'lucide-react';

import { DashboardHomePage } from './pages/DashboardHomePage';
import { SupervisorApprovalPage, clearSaCache } from './pages/SupervisorApprovalPage';
import { DeadlineReminderPage } from './pages/DeadlineReminderPage';
import { EnrolmentDetailsPage } from './pages/EnrolmentDetailsPage';
import { EnrolmentCalculationPage } from './pages/EnrolmentCalculationPage';
import { EnrolmentHistoryPage } from './pages/EnrolmentHistoryPage';
import { RoleProvider, useRole, ALL_ROLES, ROLE_LABELS, type AppRole, type DemoQueryMode, type DemoYearsWindow } from './context/RoleContext';
import { navGuard } from './utils/helpers';
import { normalizeInitialDeepLink, openInNewTab } from './utils/deepLinks';
import { Vsi_armsconfigurationsService } from './generated/services/Vsi_armsconfigurationsService';

const SUPERVISOR_APPROVAL_ROLES: AppRole[] = ['SystemAdmin', 'Supervisor'];
const CALCULATION_ROLES: AppRole[] = ['SystemAdmin', 'Supervisor', 'ENAdmin', 'Verifier'];
const DASHBOARD_URL_FALLBACK = 'https://app.powerbi.com/groups/b447b3b3-d200-43ee-b3cd-eabccd22a717/reports/a14e5dfe-22ca-4974-a97b-844a5050fb64';

normalizeInitialDeepLink();

function normalizeRequired(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error('Missing required dashboard configuration value.');
  }
  return normalized;
}

function isActiveConfiguration(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

function hasPowerBiIds(row: { vsi_powerbireportgroupid?: string; vsi_powerbiendashboardreportid?: string }): boolean {
  return !!row.vsi_powerbireportgroupid?.trim() && !!row.vsi_powerbiendashboardreportid?.trim();
}

async function getPowerBiDashboardUrl(): Promise<string> {
  const result = await Vsi_armsconfigurationsService.getAll({
    maxPageSize: 50,
    orderBy: ['modifiedon desc'],
    select: [
      'vsi_activeconfiguration',
      'vsi_powerbireportgroupid',
      'vsi_powerbiendashboardreportid',
    ],
  });

  const rows = result.data ?? [];
  const activeRow = rows.find(row => isActiveConfiguration((row as { vsi_activeconfiguration?: unknown }).vsi_activeconfiguration) && hasPowerBiIds(row));
  const configuredRow = activeRow ?? rows.find(row => hasPowerBiIds(row));
  if (!configuredRow) return DASHBOARD_URL_FALLBACK;

  const groupId = normalizeRequired(configuredRow.vsi_powerbireportgroupid);
  const reportId = normalizeRequired(configuredRow.vsi_powerbiendashboardreportid);
  return `https://app.powerbi.com/groups/${groupId}/reports/${reportId}`;
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: AppRole[] }) {
  const { activeRole } = useRole();
  if (!allowedRoles.includes(activeRole)) {
    return <Navigate to="/dashboard-home" replace />;
  }
  return <>{children}</>;
}

function RoleSwitcher({ collapsed }: { collapsed: boolean }) {
  const { activeRole, setActiveRole, demoQueryMode, setDemoQueryMode, demoYearsWindow, setDemoYearsWindow } = useRole();
  // TODO: gate visibility to SystemAdmin only once real security is implemented
  return (
    <div className={`role-switcher${collapsed ? ' role-switcher--collapsed' : ''}`}>
      {collapsed ? (
        <span className="role-switcher-badge" title={`Acting as: ${ROLE_LABELS[activeRole]}`}>
          {activeRole.slice(0, 2).toUpperCase()}
        </span>
      ) : (
        <>
          <label className="role-switcher-label" htmlFor="role-select">Acting as</label>
          <select
            id="role-select"
            className="role-switcher-select"
            value={activeRole}
            onChange={e => setActiveRole(e.target.value as typeof activeRole)}
          >
            {ALL_ROLES.map(role => (
              <option key={role} value={role}>{ROLE_LABELS[role]}</option>
            ))}
          </select>
          <label className="role-switcher-label" htmlFor="query-mode-select">Data mode</label>
          <select
            id="query-mode-select"
            className="role-switcher-select"
            value={demoQueryMode}
            onChange={e => setDemoQueryMode(e.target.value as DemoQueryMode)}
          >
            <option value="client">Client-side (load selected years)</option>
            <option value="server">Server-side (paged/search)</option>
          </select>
          <label className="role-switcher-label" htmlFor="years-window-select">Years of data</label>
          <select
            id="years-window-select"
            className="role-switcher-select"
            value={demoYearsWindow}
            onChange={e => setDemoYearsWindow(Number(e.target.value) as DemoYearsWindow)}
          >
            {Array.from({ length: 10 }, (_, idx) => idx + 1).map(years => (
              <option key={years} value={years}>{years} year{years === 1 ? '' : 's'}</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

function SideNav({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { activeRole } = useRole();

  const handleOpenDashboard = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    let dashboardUrl = DASHBOARD_URL_FALLBACK;
    try {
      dashboardUrl = await getPowerBiDashboardUrl();
    } catch {
      // Use fallback URL if config read fails.
    }
    window.open(dashboardUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <aside className={`side-nav${collapsed ? ' collapsed' : ''}`}>
      <button className="side-nav-toggle" type="button" onClick={onToggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
        <Menu size={24} />
      </button>

      <nav className="side-nav-links" aria-label="Primary">
        <a
          className="side-nav-link"
          href="#"
          onClick={handleOpenDashboard}
          title="Open Power BI Dashboard"
        >
          <LayoutDashboard size={22} />
          {!collapsed && <span>Dashboard</span>}
        </a>

        <NavLink
          to="/dashboard-home"
          className={({ isActive }) => `side-nav-link${isActive ? ' active' : ''}`}
          onClick={e => { if (navGuard.intercept('/dashboard-home')) e.preventDefault(); }}
        >
          <Home size={22} />
          {!collapsed && <span>Enrolments</span>}
        </NavLink>

        {SUPERVISOR_APPROVAL_ROLES.includes(activeRole) && (
          <NavLink
            to="/supervisor-approval"
            className={({ isActive }) => `side-nav-link${isActive ? ' active' : ''}`}
            onClick={e => {
              if (navGuard.intercept('/supervisor-approval')) {
                e.preventDefault();
                return;
              }
              clearSaCache();
            }}
          >
            <ClipboardCheck size={22} />
            {!collapsed && <span>Supervisor Approval</span>}
          </NavLink>
        )}
      </nav>

      <a
          className="side-nav-link side-nav-link--new-tab"
          href="#"
          onClick={e => { e.preventDefault(); void openInNewTab(window.location.hash); }}
          title="Open in new tab"
        >
          <ExternalLink size={22} />
          {!collapsed && <span>Open in new tab</span>}
        </a>

      <RoleSwitcher collapsed={collapsed} />
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
          <Route path="/enrolment/:source/:enrolmentId" element={<EnrolmentDetailsPage />} />
          <Route path="/supervisor-approval" element={<ProtectedRoute allowedRoles={SUPERVISOR_APPROVAL_ROLES}><SupervisorApprovalPage /></ProtectedRoute>} />
          <Route path="/deadline-reminders" element={<DeadlineReminderPage />} />
          <Route path="/calculation/:enrolmentId" element={<ProtectedRoute allowedRoles={CALCULATION_ROLES}><EnrolmentCalculationPage /></ProtectedRoute>} />
          <Route path="/calculation/:source/:enrolmentId" element={<ProtectedRoute allowedRoles={CALCULATION_ROLES}><EnrolmentCalculationPage /></ProtectedRoute>} />
          <Route path="/calculation" element={<Navigate to="/dashboard-home" replace />} />
          <Route path="/history/:historyId" element={<EnrolmentHistoryPage />} />
          <Route path="/history/:enrolmentId/:historyId" element={<EnrolmentHistoryPage />} />
          <Route path="*" element={<Navigate to="/dashboard-home" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <HashRouter>
      <RoleProvider>
        <AppShell />
      </RoleProvider>
    </HashRouter>
  );
}

export default App;
