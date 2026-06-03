import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { resolveCurrentSystemUser, checkHasDataverseSystemAdminRole, checkIsSupervisorQueueMember, checkIsEnrolmentAdminTeamMember, checkIsVerifierTeamMember } from '../utils/currentUser';

export type AppRole = 'SystemAdmin' | 'Supervisor' | 'ENAdmin' | 'Verifier';

export const ALL_ROLES: AppRole[] = ['SystemAdmin', 'Supervisor', 'ENAdmin', 'Verifier'];

export const ROLE_LABELS: Record<AppRole, string> = {
  SystemAdmin: 'System Admin',
  Supervisor: 'Supervisor',
  ENAdmin: 'EN Admin',
  Verifier: 'Verifier',
};

const STORAGE_KEY = 'dev_simulated_role';

function readStoredRole(): AppRole {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && ALL_ROLES.includes(stored as AppRole)) return stored as AppRole;
  } catch { /* ignore */ }
  return 'SystemAdmin';
}

type RoleContextValue = {
  activeRole: AppRole;
  setActiveRole: (role: AppRole) => void;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [activeRole, setActiveRoleState] = useState<AppRole>(readStoredRole);
  const [validating, setValidating] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const user = await resolveCurrentSystemUser();
        const initialRole = readStoredRole();
        let valid = false;
        let fallback: AppRole = 'Verifier';

        if (initialRole === 'SystemAdmin') {
          valid = await checkHasDataverseSystemAdminRole(user.systemUserId);
          fallback = 'ENAdmin';
        } else if (initialRole === 'Supervisor') {
          valid = await checkIsSupervisorQueueMember(user.systemUserId);
          fallback = 'ENAdmin';
        } else if (initialRole === 'ENAdmin') {
          valid = await checkIsEnrolmentAdminTeamMember(user.systemUserId);
          fallback = 'Verifier';
        } else if (initialRole === 'Verifier') {
          valid = await checkIsVerifierTeamMember(user.systemUserId);
          fallback = 'Verifier';
        }

        if (!valid) {
          try { sessionStorage.setItem(STORAGE_KEY, fallback); } catch { /* ignore */ }
          setActiveRoleState(fallback);
        }
      } catch {
        // Cannot verify — fall back to Verifier to be safe
        try { sessionStorage.setItem(STORAGE_KEY, 'Verifier'); } catch { /* ignore */ }
        setActiveRoleState('Verifier');
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

  if (validating) return null;

  return (
    <RoleContext.Provider value={{ activeRole, setActiveRole }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within a RoleProvider');
  return ctx;
}
