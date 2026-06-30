import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { checkHasDataverseSystemAdminRole, checkIsSupervisorQueueMember, checkIsEnrolmentAdminTeamMember, checkIsVerifierTeamMember } from '../utils/currentUser';

export type AppRole = 'SystemAdmin' | 'Supervisor' | 'ENAdmin' | 'Verifier';
export type DemoQueryMode = 'client' | 'server';
export type DemoYearsWindow = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export const ALL_ROLES: AppRole[] = ['SystemAdmin', 'Supervisor', 'ENAdmin', 'Verifier'];

export const ROLE_LABELS: Record<AppRole, string> = {
  SystemAdmin: 'System Admin',
  Supervisor: 'Supervisor',
  ENAdmin: 'EN Admin',
  Verifier: 'Verifier',
};

const STORAGE_KEY = 'dev_simulated_role';
const QUERY_MODE_STORAGE_KEY = 'dashboard_query_mode';
const YEARS_WINDOW_STORAGE_KEY = 'dashboard_years_window';

function readStoredRole(): AppRole {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && ALL_ROLES.includes(stored as AppRole)) return stored as AppRole;
  } catch { /* ignore */ }
  return 'SystemAdmin';
}

function readStoredQueryMode(): DemoQueryMode {
  try {
    const stored = sessionStorage.getItem(QUERY_MODE_STORAGE_KEY);
    if (stored === 'client' || stored === 'server') return stored;
  } catch { /* ignore */ }
  return 'client';
}

function readStoredYearsWindow(): DemoYearsWindow {
  try {
    const stored = Number(sessionStorage.getItem(YEARS_WINDOW_STORAGE_KEY));
    if (Number.isInteger(stored) && stored >= 1 && stored <= 10) return stored as DemoYearsWindow;
  } catch { /* ignore */ }
  return 5;
}

type RoleContextValue = {
  activeRole: AppRole;
  setActiveRole: (role: AppRole) => void;
  demoQueryMode: DemoQueryMode;
  setDemoQueryMode: (mode: DemoQueryMode) => void;
  demoYearsWindow: DemoYearsWindow;
  setDemoYearsWindow: (years: DemoYearsWindow) => void;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [activeRole, setActiveRoleState] = useState<AppRole>(readStoredRole);
  const [demoQueryMode, setDemoQueryModeState] = useState<DemoQueryMode>(readStoredQueryMode);
  const [demoYearsWindow, setDemoYearsWindowState] = useState<DemoYearsWindow>(readStoredYearsWindow);
  const [validating, setValidating] = useState(true);

  useEffect(() => {
    (async () => {
      const initialRole = readStoredRole();
      try {
        let valid = false;
        let fallback: AppRole = 'Verifier';

        if (initialRole === 'SystemAdmin') {
          valid = await checkHasDataverseSystemAdminRole();
          fallback = 'ENAdmin';
        } else if (initialRole === 'Supervisor') {
          valid = await checkIsSupervisorQueueMember();
          fallback = 'ENAdmin';
        } else if (initialRole === 'ENAdmin') {
          valid = await checkIsEnrolmentAdminTeamMember();
          fallback = 'Verifier';
        } else if (initialRole === 'Verifier') {
          valid = await checkIsVerifierTeamMember();
          fallback = 'Verifier';
        }

        if (!valid) {
          try { sessionStorage.setItem(STORAGE_KEY, fallback); } catch { /* ignore */ }
          setActiveRoleState(fallback);
        }
      } catch {
        // Cannot connect to Dataverse or resolve the current user.
        // Keep the stored role — the Dataverse security layer still enforces access.
      } finally {
        setValidating(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveRole = (role: AppRole) => {
    try { sessionStorage.setItem(STORAGE_KEY, role); } catch { /* ignore */ }
    setActiveRoleState(role);
    window.location.reload();
  };

  const setDemoQueryMode = (mode: DemoQueryMode) => {
    try { sessionStorage.setItem(QUERY_MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
    setDemoQueryModeState(mode);
  };

  const setDemoYearsWindow = (years: DemoYearsWindow) => {
    try { sessionStorage.setItem(YEARS_WINDOW_STORAGE_KEY, String(years)); } catch { /* ignore */ }
    setDemoYearsWindowState(years);
  };

  if (validating) return null;

  return (
    <RoleContext.Provider value={{
      activeRole,
      setActiveRole,
      demoQueryMode,
      setDemoQueryMode,
      demoYearsWindow,
      setDemoYearsWindow,
    }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within a RoleProvider');
  return ctx;
}
