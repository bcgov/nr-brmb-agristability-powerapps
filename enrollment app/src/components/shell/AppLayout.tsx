import { type ReactNode } from 'react';

import { EnvironmentBanner, type EnvironmentTone } from './EnvironmentBanner';
import { SideNav, type SideNavItem } from './SideNav';

interface AppLayoutProps {
  title: string;
  environmentName?: string | null;
  userName?: string | null;
  bannerTone?: EnvironmentTone;
  navCollapsed: boolean;
  onToggleNav: () => void;
  navItems: SideNavItem[];
  navSecondaryItems?: SideNavItem[];
  navFooter?: ReactNode;
  onOpenAppSwitcher?: () => void;
  bannerBrand?: ReactNode;
  children: ReactNode;
}

export function AppLayout({
  title,
  environmentName,
  userName,
  bannerTone,
  navCollapsed,
  onToggleNav,
  navItems,
  navSecondaryItems,
  navFooter,
  onOpenAppSwitcher,
  bannerBrand,
  children,
}: AppLayoutProps) {
  return (
    <div className="app-frame">
      <EnvironmentBanner
        title={title}
        environmentName={environmentName}
        userName={userName}
        tone={bannerTone}
        onOpenAppSwitcher={onOpenAppSwitcher}
        brand={bannerBrand}
      />
      <div className="app-shell">
        <SideNav
          collapsed={navCollapsed}
          onToggle={onToggleNav}
          primaryItems={navItems}
          secondaryItems={navSecondaryItems}
          footer={navFooter}
        />
        <main className="app-shell-content">{children}</main>
      </div>
    </div>
  );
}
