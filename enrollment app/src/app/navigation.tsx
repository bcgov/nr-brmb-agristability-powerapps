import { ClipboardCheck, ExternalLink, Home, LayoutDashboard } from 'lucide-react';

import { createLinkNavItem, createRouteNavItem, createSideNavConfig } from '../components/shell/navConfig';
import { type SideNavConfig } from '../components/shell/navConfig';
import { type AppRole } from '../context/RoleContext';
import { clearSaCache } from '../pages/SupervisorApprovalPage';
import { openInNewTab } from '../utils/deepLinks';
import { navGuard } from '../utils/helpers';
import { SUPERVISOR_APPROVAL_ROLES } from './roleRules';

interface BuildEnrollmentNavConfigArgs {
  activeRole: AppRole;
  onOpenDashboard: () => Promise<void> | void;
}

export function buildEnrollmentNavConfig({ activeRole, onOpenDashboard }: BuildEnrollmentNavConfigArgs): SideNavConfig {
  return createSideNavConfig(
    [
      createLinkNavItem({
        key: 'dashboard',
        label: 'Dashboard',
        icon: <LayoutDashboard size={22} />,
        href: '#',
        title: 'Open Power BI Dashboard',
        onClick: e => {
          e.preventDefault();
          void onOpenDashboard();
        },
      }),
      createRouteNavItem({
        key: 'enrolments',
        label: 'Enrolments',
        icon: <Home size={22} />,
        to: '/dashboard-home',
        onClick: e => {
          if (navGuard.intercept('/dashboard-home')) e.preventDefault();
        },
      }),
      createRouteNavItem({
        key: 'supervisor-approval',
        label: 'Supervisor Approval',
        icon: <ClipboardCheck size={22} />,
        to: '/supervisor-approval',
        hidden: !SUPERVISOR_APPROVAL_ROLES.includes(activeRole),
        onClick: e => {
          if (navGuard.intercept('/supervisor-approval')) {
            e.preventDefault();
            return;
          }
          clearSaCache();
        },
      }),
    ],
    [
      createLinkNavItem({
        key: 'open-new-tab',
        label: 'Open in new tab',
        icon: <ExternalLink size={22} />,
        href: '#',
        title: 'Open in new tab',
        className: 'side-nav-link--new-tab',
        onClick: e => {
          e.preventDefault();
          void openInNewTab(window.location.hash);
        },
      }),
    ],
  );
}
