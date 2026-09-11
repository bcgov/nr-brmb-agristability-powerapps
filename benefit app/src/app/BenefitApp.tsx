import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { FileText, Home, Settings, BarChart3 } from 'lucide-react';

import { AppLayout } from '../components/shell/AppLayout';
import { createRouteNavItem, createSideNavConfig } from '../components/shell/navConfig';
import { DEPLOY_ENV } from '../constants/deployEnvConfig';
import { AppSwitcher } from './AppSwitcher';
import { useCurrentUser } from './useCurrentUser';

function BenefitLogoMark() {
  return (
    <svg
      className="benefit-brand-mark"
      viewBox="0 0 49 49"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1" y="1" width="47" height="47" fill="#ffffff" />
      <g
        transform="translate(0.000000,49.000000) scale(0.100000,-0.100000)"
        fill="currentColor"
        stroke="none"
      >
        <path d="M0 245 l0 -245 245 0 245 0 0 245 0 245 -245 0 -245 0 0 -245z m227 143 c25 -23 30 -66 13 -99 -8 -14 -7 -25 3 -39 13 -19 17 -15 53 65 21 47 41 85 45 85 10 0 123 -290 116 -297 -12 -12 -38 8 -48 37 -11 29 -13 30 -70 30 -57 0 -59 1 -49 20 8 15 21 20 50 20 22 0 40 2 40 4 0 2 -9 26 -21 53 l-21 48 -14 -30 c-8 -16 -29 -64 -48 -106 l-34 -76 -94 1 -93 1 -3 153 -3 152 78 0 c65 0 80 -3 100 -22z" />
        <path d="M90 330 l0 -41 58 3 57 3 0 35 0 35 -57 3 -58 3 0 -41z" />
        <path d="M90 195 l0 -55 50 0 c37 0 55 5 70 20 44 44 8 90 -70 90 l-50 0 0 -55z" />
      </g>
    </svg>
  );
}

function DashboardPage() {
  return (
    <section className="page-panel">
      <h1>Dashboard</h1>
      <p>Welcome to the benefit app dashboard.</p>
    </section>
  );
}

function ApplicationsPage() {
  return (
    <section className="page-panel">
      <h1>Applications</h1>
      <p>Review and manage benefit applications here.</p>
    </section>
  );
}

function ReportsPage() {
  return (
    <section className="page-panel">
      <h1>Reports</h1>
      <p>View programme and performance reports.</p>
    </section>
  );
}

function SettingsPage() {
  return (
    <section className="page-panel">
      <h1>Settings</h1>
      <p>Application configuration and preferences.</p>
    </section>
  );
}

function getEnvironmentKey(value: string | null | undefined): 'dev' | 'test' | 'prod' | 'default' {
  const normalized = value?.trim().toLowerCase() ?? '';

  if (normalized.includes('prod')) return 'prod';
  if (normalized.includes('test')) return 'test';
  if (normalized.includes('dev') || normalized.includes('local') || normalized.includes('sandbox')) return 'dev';
  return 'default';
}

function getBannerTitle(value: string | null | undefined): string {
  const env = getEnvironmentKey(value);
  const label = env === 'prod' ? 'PROD' : env === 'test' ? 'TEST' : 'DEV';
  return `BENEFIT APP ${label}`;
}

export function BenefitApp() {
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [showAppSwitcher, setShowAppSwitcher] = useState(false);
  const { name: userName } = useCurrentUser();

  const environmentName = DEPLOY_ENV.stage.toUpperCase();

  const navConfig = createSideNavConfig([
    createRouteNavItem({
      key: 'dashboard',
      label: 'Dashboard',
      icon: <Home size={22} />,
      to: '/dashboard',
    }),
    createRouteNavItem({
      key: 'applications',
      label: 'Applications',
      icon: <FileText size={22} />,
      to: '/applications',
    }),
    createRouteNavItem({
      key: 'reports',
      label: 'Reports',
      icon: <BarChart3 size={22} />,
      to: '/reports',
    }),
    createRouteNavItem({
      key: 'settings',
      label: 'Settings',
      icon: <Settings size={22} />,
      to: '/settings',
    }),
  ]);

  const environmentKey = getEnvironmentKey(environmentName);
  const bannerTitle = getBannerTitle(environmentName);

  return (
    <>
      <AppLayout
        title={bannerTitle}
        environmentName={environmentName}
        userName={userName}
        bannerTone={environmentKey}
        navCollapsed={navCollapsed}
        onToggleNav={() => setNavCollapsed(prev => !prev)}
        navItems={navConfig.primaryItems}
        navSecondaryItems={navConfig.secondaryItems}
        bannerBrand={<BenefitLogoMark />}
        onOpenAppSwitcher={() => setShowAppSwitcher(true)}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppLayout>

      {showAppSwitcher && <AppSwitcher onClose={() => setShowAppSwitcher(false)} />}
    </>
  );
}
