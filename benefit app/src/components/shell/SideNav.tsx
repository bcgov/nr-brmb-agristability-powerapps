import { type ReactNode } from 'react';
import { Menu } from 'lucide-react';

import { NavItem, type SideNavItem } from './NavItem';

export type { SideNavItem } from './NavItem';

interface SideNavProps {
  collapsed: boolean;
  onToggle: () => void;
  primaryItems: SideNavItem[];
  secondaryItems?: SideNavItem[];
  footer?: ReactNode;
}

export function SideNav({ collapsed, onToggle, primaryItems, secondaryItems = [], footer }: SideNavProps) {
  return (
    <aside className={`side-nav${collapsed ? ' collapsed' : ''}`}>
      <button
        className="side-nav-toggle"
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        <Menu size={24} />
      </button>

      <nav className="side-nav-links" aria-label="Primary">
        {primaryItems.map(item => (
          <NavItem key={item.key} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {secondaryItems.map(item => (
        <NavItem key={item.key} item={item} collapsed={collapsed} />
      ))}

      {footer}
    </aside>
  );
}
