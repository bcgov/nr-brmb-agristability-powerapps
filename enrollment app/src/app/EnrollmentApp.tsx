import { useEffect, useState } from 'react';

import { AppSwitcher } from '../components/AppSwitcher';
import { AppLayout } from '../components/shell/AppLayout';
import { useRole } from '../context/RoleContext';
import { normalizeInitialDeepLink } from '../utils/deepLinks';
import { resolveCurrentSystemUser } from '../utils/currentUser';
import { EnrolmentLogoMark } from './brand';
import { DASHBOARD_URL_FALLBACK, getBannerTitle, getEnvironmentKey, getEnvironmentName, getPowerBiDashboardUrl } from './environment';
import { buildEnrollmentNavConfig } from './navigation';
import { RoleSwitcher } from './RoleSwitcher';
import { EnrollmentRoutes } from './routes';

normalizeInitialDeepLink();

export function EnrollmentApp() {
  const { activeRole } = useRole();
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [showAppSwitcher, setShowAppSwitcher] = useState(false);
  const [environmentName, setEnvironmentName] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    getEnvironmentName()
      .then(name => {
        if (!ignore) setEnvironmentName(name);
      })
      .catch(() => {
        if (!ignore) setEnvironmentName(null);
      });

    resolveCurrentSystemUser()
      .then(user => {
        if (!ignore) setCurrentUserName(user.displayName);
      })
      .catch(() => {
        if (!ignore) setCurrentUserName(null);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleOpenDashboard = async () => {
    let dashboardUrl = DASHBOARD_URL_FALLBACK;
    try {
      dashboardUrl = await getPowerBiDashboardUrl();
    } catch {
      // Use fallback URL if config read fails.
    }
    window.open(dashboardUrl, '_blank', 'noopener,noreferrer');
  };

  const navConfig = buildEnrollmentNavConfig({
    activeRole,
    onOpenDashboard: handleOpenDashboard,
  });

  const bannerTone = environmentName ? getEnvironmentKey(environmentName) : 'default';
  const bannerTitle = environmentName ? getBannerTitle(environmentName) : 'ENROLMENT';

  return (
    <>
      <AppLayout
        title={bannerTitle}
        environmentName={environmentName}
        userName={currentUserName}
        bannerTone={bannerTone}
        navCollapsed={navCollapsed}
        onToggleNav={() => setNavCollapsed(prev => !prev)}
        navItems={navConfig.primaryItems}
        navSecondaryItems={navConfig.secondaryItems}
        navFooter={<RoleSwitcher collapsed={navCollapsed} />}
        onOpenAppSwitcher={() => setShowAppSwitcher(true)}
        bannerBrand={<EnrolmentLogoMark />}
      >
        <EnrollmentRoutes />
      </AppLayout>
      {showAppSwitcher && <AppSwitcher onClose={() => setShowAppSwitcher(false)} />}
    </>
  );
}
