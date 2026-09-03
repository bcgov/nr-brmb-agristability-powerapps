import { ALL_ROLES, ROLE_LABELS, type DemoYearsWindow, useRole } from '../context/RoleContext';

export function RoleSwitcher({ collapsed }: { collapsed: boolean }) {
  const { activeRole, setActiveRole, demoYearsWindow, setDemoYearsWindow } = useRole();
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
