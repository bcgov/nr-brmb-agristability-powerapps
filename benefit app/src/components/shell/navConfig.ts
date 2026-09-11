import { type MouseEventHandler, type ReactNode } from 'react';

import { type SideNavItem } from './NavItem';

interface BaseNavItemConfig {
  key: string;
  label: string;
  icon: ReactNode;
  title?: string;
  className?: string;
  hidden?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

interface RouteNavItemConfig extends BaseNavItemConfig {
  to: string;
}

interface LinkNavItemConfig extends BaseNavItemConfig {
  href: string;
  target?: '_self' | '_blank';
  rel?: string;
}

export interface SideNavConfig {
  primaryItems: SideNavItem[];
  secondaryItems?: SideNavItem[];
}

export function createRouteNavItem(config: RouteNavItemConfig): SideNavItem {
  return {
    key: config.key,
    label: config.label,
    icon: config.icon,
    to: config.to,
    title: config.title,
    className: config.className,
    hidden: config.hidden,
    onClick: config.onClick,
  };
}

export function createLinkNavItem(config: LinkNavItemConfig): SideNavItem {
  return {
    key: config.key,
    label: config.label,
    icon: config.icon,
    href: config.href,
    title: config.title,
    className: config.className,
    hidden: config.hidden,
    target: config.target,
    rel: config.rel,
    onClick: config.onClick,
  };
}

export function createSideNavConfig(primaryItems: SideNavItem[], secondaryItems: SideNavItem[] = []): SideNavConfig {
  return { primaryItems, secondaryItems };
}
