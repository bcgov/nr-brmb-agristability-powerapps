import { useEffect, useState } from 'react';
import { SystemuserprofilescollectionService } from '../generated/services/SystemuserprofilescollectionService';
import { TeamprofilescollectionService } from '../generated/services/TeamprofilescollectionService';
import { TeammembershipsService } from '../generated/services/TeammembershipsService';
import { FieldpermissionsService } from '../generated/services/FieldpermissionsService';
import { resolveCurrentSystemUser } from '../utils/currentUser';

/**
 * Map of Dataverse attribute logical name → whether the current user
 * has canupdate = Allowed on their field security profiles.
 *
 * Fields absent from the map are not field-secured in Dataverse and
 * should fall back to the role-based canEdit check.
 */
export type FieldPermMap = Map<string, boolean>;

/** Cached results keyed by role so switching roles picks up the right policy. */
const cacheByRole = new Map<string, FieldPermMap>();

async function fetchFieldPermissions(entityName: string, restrictive: boolean): Promise<FieldPermMap> {
  const cacheKey = `${entityName}:${restrictive}`;
  if (cacheByRole.has(cacheKey)) return cacheByRole.get(cacheKey)!;

  const user = await resolveCurrentSystemUser();
  const userId = user.systemUserId;

  // 1. Profiles assigned directly to the user
  const userProfilesResult = await SystemuserprofilescollectionService.getAll({
    select: ['fieldsecurityprofileid'],
    filter: `systemuserid eq '${userId}'`,
    maxPageSize: 50,
  });
  const userProfileIds = (userProfilesResult.data ?? [])
    .map(p => p.fieldsecurityprofileid)
    .filter(Boolean);

  // 2. Profiles assigned to the user's teams
  const teamMembershipsResult = await TeammembershipsService.getAll({
    select: ['teamid'],
    filter: `systemuserid eq '${userId}'`,
    maxPageSize: 100,
  });
  const teamIds = (teamMembershipsResult.data ?? [])
    .map(m => m.teamid)
    .filter(Boolean);

  const teamProfileIds: string[] = [];
  if (teamIds.length > 0) {
    const teamFilter = teamIds.map(id => `teamid eq '${id}'`).join(' or ');
    const teamProfilesResult = await TeamprofilescollectionService.getAll({
      select: ['fieldsecurityprofileid'],
      filter: teamFilter,
      maxPageSize: 200,
    });
    teamProfileIds.push(
      ...(teamProfilesResult.data ?? [])
        .map(p => p.fieldsecurityprofileid)
        .filter(Boolean),
    );
  }

  // Deduplicate all profile IDs
  const allProfileIds = [...new Set([...userProfileIds, ...teamProfileIds])];

  if (allProfileIds.length === 0) {
    const empty = new Map<string, boolean>();
    cacheByRole.set(cacheKey, empty);
    return empty;
  }

  const profileFilter = allProfileIds
    .map(id => `_fieldsecurityprofileid_value eq '${id}'`)
    .join(' or ');

  const permResult = await FieldpermissionsService.getAll({
    select: ['attributelogicalname', 'canupdate'],
    filter: `entityname eq '${entityName}' and (${profileFilter})`,
    maxPageSize: 500,
  });

  const map = new Map<string, boolean>();
  for (const perm of permResult.data ?? []) {
    const attr = perm.attributelogicalname;
    const canUpdate = perm.canupdate === 4;
    if (restrictive) {
      // Intersection: if ANY profile denies, the field is read-only.
      // Used when acting as Supervisor so the Operations Supervisor FSP
      // takes precedence over the System Administrator FSP.
      if (!map.has(attr) || !canUpdate) map.set(attr, canUpdate);
    } else {
      // Union: if ANY profile allows, the field is editable.
      // Used when acting as System Admin.
      if (!map.has(attr) || canUpdate) map.set(attr, canUpdate);
    }
  }

  cacheByRole.set(cacheKey, map);
  return map;
}

export function clearFieldPermissionsCache(): void {
  cacheByRole.clear();
}

/**
 * Resolves field-level update permissions for the current user on
 * `entityName` (defaults to vsi_participantprogramyear).
 *
 * Usage in a component:
 *   const { fieldPerms } = useFieldPermissions();
 *   // Then: canEdit && canEditField(fieldPerms, 'vsi_enrolmentstatus', canEdit)
 */
export function useFieldPermissions(entityName = 'vsi_participantprogramyear', restrictive = false): {
  fieldPerms: FieldPermMap;
  fieldPermsLoading: boolean;
} {
  const cacheKey = `${entityName}:${restrictive}`;
  const [fieldPerms, setFieldPerms] = useState<FieldPermMap>(() => cacheByRole.get(cacheKey) ?? new Map());
  const [fieldPermsLoading, setFieldPermsLoading] = useState(!cacheByRole.has(cacheKey));

  useEffect(() => {
    if (cacheByRole.has(cacheKey)) {
      setFieldPerms(cacheByRole.get(cacheKey)!);
      setFieldPermsLoading(false);
      return;
    }

    let cancelled = false;
    fetchFieldPermissions(entityName, restrictive)
      .then(map => {
        if (!cancelled) {
          setFieldPerms(map);
          setFieldPermsLoading(false);
        }
      })
      .catch(() => {
        // On error, fall back gracefully — canEditField will use the role check alone
        if (!cancelled) setFieldPermsLoading(false);
      });

    return () => { cancelled = true; };
  // entityName is stable — passed as a literal in all current call sites
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { fieldPerms, fieldPermsLoading };
}

/**
 * Returns true if the current user may update `attr`.
 *
 * Logic:
 * - If the field has an FSP record → use its canupdate flag (AND the role canEdit gate)
 * - If no FSP record exists → the field is not field-secured, fall back to canEdit alone
 */
export function canEditField(fieldPerms: FieldPermMap, attr: string, canEdit: boolean): boolean {
  if (!canEdit) return false;
  if (fieldPerms.has(attr)) return fieldPerms.get(attr) === true;
  return canEdit;
}
