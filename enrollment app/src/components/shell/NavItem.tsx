import { type MouseEventHandler, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

interface SideNavItemBase {
  key: string;
  label: string;
  icon: ReactNode;
  title?: string;
  className?: string;
  hidden?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

interface SideNavRouteItem extends SideNavItemBase {
  to: string;
  href?: never;
}

interface SideNavLinkItem extends SideNavItemBase {
  href: string;
  to?: never;
  target?: '_self' | '_blank';
  rel?: string;
}

export type SideNavItem = SideNavRouteItem | SideNavLinkItem;

interface NavItemProps {
  item: SideNavItem;
  collapsed: boolean;
}

function isRouteItem(item: SideNavItem): item is SideNavRouteItem {
  return typeof (item as SideNavRouteItem).to === 'string';
}

export function NavItem({ item, collapsed }: NavItemProps) {
  if (item.hidden) return null;

  const baseClassName = `side-nav-link${item.className ? ` ${item.className}` : ''}`;

  if (isRouteItem(item)) {
    return (
      <NavLink
        to={item.to}
        title={item.title}
        onClick={item.onClick}
        className={({ isActive }) => `${baseClassName}${isActive ? ' active' : ''}`}
      >
        {item.icon}
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    );
  }

  return (
    <a
      className={baseClassName}
      href={item.href}
      title={item.title}
      onClick={item.onClick}
      target={item.target}
      rel={item.rel}
    >
      {item.icon}
      {!collapsed && <span>{item.label}</span>}
    </a>
  );
}
