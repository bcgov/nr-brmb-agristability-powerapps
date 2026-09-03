import { type AppRole } from '../context/RoleContext';

export const SUPERVISOR_APPROVAL_ROLES: AppRole[] = ['SystemAdmin', 'Supervisor'];
export const CALCULATION_ROLES: AppRole[] = ['SystemAdmin', 'Supervisor', 'ENAdmin', 'Verifier'];
