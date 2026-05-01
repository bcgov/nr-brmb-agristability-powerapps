import { useState, useEffect } from 'react';
import { QueueitemsService } from '../generated/services/QueueitemsService';
import { SystemusersService } from '../generated/services/SystemusersService';
import { QueuemembershipsService } from '../generated/services/QueuemembershipsService';
import { TeamsService } from '../generated/services/TeamsService';
import { TeammembershipsService } from '../generated/services/TeammembershipsService';
import { RolesService } from '../generated/services/RolesService';
import { SystemuserrolescollectionService } from '../generated/services/SystemuserrolescollectionService';
import { getInitials } from '../utils/helpers';

export interface AssignableUser {
  systemUserId: string;
  displayName: string;
  jobTitle?: string;
  mail?: string;
  group?: string;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildUserIdOrFilter(ids: string[]): string {
  if (ids.length === 0) return 'false';
  return `(${ids.map(id => `systemuserid eq '${id}'`).join(' or ')})`;
}

function isMissingQueueMembershipDataSource(message?: string): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('data source not found') && normalized.includes('queuememberships');
}

export function AssignWorkerModal({
  enrolmentName,
  queueitemId,
  queueId,
  onClose,
  onAssigned,
}: {
  enrolmentName: string;
  queueitemId: string | undefined;
  queueId?: string;
  queueName?: string;
  onClose: () => void;
  onAssigned: (workerId: string, workerName: string) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<AssignableUser[]>([]);
  // queueMemberIds: set of systemuserids that belong to the queue when queue scoping is enabled.
  const [queueMemberIds, setQueueMemberIds] = useState<Set<string> | null>(null);
  const [restrictToQueueMembers, setRestrictToQueueMembers] = useState(true);
  // group ID sets — stored in state so handleSearch can apply badges on search results too
  const [groupIds, setGroupIds] = useState<{
    sysAdmin: Set<string>;
    admin: Set<string>;
    queue: Set<string>;
    verifier: Set<string>;
  }>({ sysAdmin: new Set(), admin: new Set(), queue: new Set(), verifier: new Set() });
  const [selected, setSelected] = useState<AssignableUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const loadUsersByIds = async (ids: string[]): Promise<AssignableUser[]> => {
    if (ids.length === 0) return [];

    const collected = new Map<string, AssignableUser>();
    const idChunks = chunkArray(ids, 50);

    for (const idChunk of idChunks) {
      const users = await SystemusersService.getAll({
        select: ['systemuserid', 'fullname', 'jobtitle', 'internalemailaddress', 'domainname', 'isdisabled'],
        filter: `${buildUserIdOrFilter(idChunk)} and isdisabled eq false and not startswith(fullname,'#')`,
        orderBy: ['fullname asc'],
        maxPageSize: 500,
      });

      if (!users.success) {
        throw new Error(users.error?.message ?? 'Failed to load user details');
      }

      for (const u of users.data ?? []) {
        if (!u.systemuserid || u.isdisabled || collected.has(u.systemuserid)) continue;
        collected.set(u.systemuserid, {
          systemUserId: u.systemuserid,
          displayName: u.fullname ?? u.internalemailaddress ?? u.domainname ?? u.systemuserid,
          jobTitle: u.jobtitle ?? undefined,
          mail: u.internalemailaddress ?? undefined,
        });
      }
    }

    return [...collected.values()]
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  };

  const searchActiveUsers = async (term: string, memberIds?: Set<string> | null): Promise<AssignableUser[]> => {
    const escaped = term.replace(/'/g, "''");
    const memberConstraint = memberIds && memberIds.size > 0
      ? ` and ${buildUserIdOrFilter([...memberIds])}`
      : '';

    const filters = term
      ? [
          `contains(fullname,'${escaped}') and isdisabled eq false and not startswith(fullname,'#')${memberConstraint}`,
          `startswith(fullname,'${escaped}') and isdisabled eq false and not startswith(fullname,'#')${memberConstraint}`,
          `contains(internalemailaddress,'${escaped}') and isdisabled eq false and not startswith(fullname,'#')${memberConstraint}`,
          `contains(domainname,'${escaped}') and isdisabled eq false and not startswith(fullname,'#')${memberConstraint}`,
        ]
      : [`isdisabled eq false and not startswith(fullname,'#')${memberConstraint}`];

    const collected = new Map<string, AssignableUser>();
    const errors: string[] = [];

    for (const filter of filters) {
      if (collected.size >= 20) break;
      const result = await SystemusersService.getAll({
        select: ['systemuserid', 'fullname', 'jobtitle', 'internalemailaddress', 'domainname', 'isdisabled'],
        filter,
        orderBy: ['fullname asc'],
        maxPageSize: 20,
      });

      if (!result.success) {
        errors.push(result.error?.message ?? 'Unknown query error');
        continue;
      }

      for (const u of result.data ?? []) {
        if (!u.systemuserid || u.isdisabled || collected.has(u.systemuserid)) continue;
        collected.set(u.systemuserid, {
          systemUserId: u.systemuserid,
          displayName: u.fullname ?? u.internalemailaddress ?? u.domainname ?? u.systemuserid,
          jobTitle: u.jobtitle ?? undefined,
          mail: u.internalemailaddress ?? undefined,
        });
        if (collected.size >= 20) break;
      }
    }

    if (collected.size === 0 && errors.length > 0) {
      throw new Error(errors[0]);
    }

    return Array.from(collected.values());
  };

  // Fetch queuemembership records for queue-scoped assignment; fallback to active users if the table isn't available.
  useEffect(() => {
    if (!queueitemId || !queueId) return;
    let cancelled = false;
    (async () => {
      setSearching(true);
      setError(null);
      setHasSearched(true);
      try {
        const memberships = await QueuemembershipsService.getAll({
          select: ['systemuserid', 'queueid'],
          filter: `queueid eq '${queueId}'`,
          maxPageSize: 500,
        });
        if (cancelled) return;

        if (!memberships.success) {
          const message = memberships.error?.message ?? 'Failed to load queue members';
          if (!isMissingQueueMembershipDataSource(message)) {
            setError(message);
            return;
          }

          setRestrictToQueueMembers(false);
          setQueueMemberIds(null);
          const fallbackUsers = await searchActiveUsers('', null);
          if (cancelled) return;
          setResults(fallbackUsers);
          setError(null);
          return;
        }

        const queueIds = new Set(
          (memberships.data ?? []).map(m => m.systemuserid).filter((id): id is string => !!id)
        );
        setRestrictToQueueMembers(true);
        setQueueMemberIds(queueIds);

        // Helper to fetch all userids for a named team
        const getTeamMemberIds = async (teamName: string): Promise<Set<string>> => {
          const teamsResp = await TeamsService.getAll({ filter: `name eq '${teamName}'`, maxPageSize: 1 });
          if (!teamsResp.success || !teamsResp.data || teamsResp.data.length === 0) return new Set();
          const teamId = teamsResp.data[0].teamid;
          const membersResp = await TeammembershipsService.getAll({ filter: `teamid eq '${teamId}'`, maxPageSize: 500 });
          if (!membersResp.success || !membersResp.data) return new Set();
          return new Set(membersResp.data.map(m => m.systemuserid).filter((id): id is string => !!id));
        };

        // Helper to fetch all userids that have a named security role.
        // Dataverse creates a copy of each role per business unit, so there may be
        // multiple role records with the same name. We fetch ALL of them and union
        // the assigned users across every BU-scoped copy.
        const getRoleUserIds = async (roleName: string): Promise<Set<string>> => {
          const rolesResp = await RolesService.getAll({ filter: `name eq '${roleName}'`, maxPageSize: 500 });
          if (!rolesResp.success || !rolesResp.data || rolesResp.data.length === 0) return new Set();
          const userIds = new Set<string>();
          await Promise.all(rolesResp.data.map(async role => {
            const userRolesResp = await SystemuserrolescollectionService.getAll({ filter: `roleid eq '${role.roleid}'`, maxPageSize: 500 });
            if (userRolesResp.success && userRolesResp.data) {
              userRolesResp.data.forEach(r => { if (r.systemuserid) userIds.add(r.systemuserid); });
            }
          }));
          return userIds;
        };

        // Fetch Enrolment Admin and Verifiers Team Member team members and merge
        let adminIds = new Set<string>();
        let verifierIds = new Set<string>();
        let sysAdminIds = new Set<string>();
        try { adminIds = await getTeamMemberIds('Enrolment Admin'); } catch { /* non-fatal */ }
        try { verifierIds = await getTeamMemberIds('Verifier Team Member'); } catch { /* non-fatal */ }
        try { sysAdminIds = await getRoleUserIds('System Administrator'); } catch { /* non-fatal */ }
        setGroupIds({ sysAdmin: sysAdminIds, admin: adminIds, queue: queueIds, verifier: verifierIds });

        const allIds = new Set([...queueIds, ...adminIds, ...verifierIds, ...sysAdminIds]);
        if (allIds.size === 0) {
          setResults([]);
          return;
        }

        const rawUsers = await loadUsersByIds([...allIds]);
        if (cancelled) return;
        setResults(applyGroupBadges(rawUsers, sysAdminIds, adminIds, queueIds, verifierIds));
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err ?? 'Failed to load queue members');
        if (isMissingQueueMembershipDataSource(message)) {
          setRestrictToQueueMembers(false);
          setQueueMemberIds(null);
          try {
            const fallbackUsers = await searchActiveUsers('', null);
            if (!cancelled) {
              setResults(fallbackUsers);
              setError(null);
            }
          } catch (fallbackErr) {
            if (!cancelled) setError(fallbackErr instanceof Error ? fallbackErr.message : 'Failed to load users');
          }
        } else {
          setError(message);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [queueId, queueitemId]);

  const applyGroupBadges = (
    users: AssignableUser[],
    sysAdmin: Set<string>,
    admin: Set<string>,
    queue: Set<string>,
    verifier: Set<string>
  ): AssignableUser[] =>
    users.map(u => ({
        ...u,
        group: sysAdmin.has(u.systemUserId) ? 'System Administrator'
          : admin.has(u.systemUserId) ? 'Enrolment Admin'
          : queue.has(u.systemUserId) ? 'Supervisor Approval Queue Member'
          : verifier.has(u.systemUserId) ? 'Verifier Team Member'
          : undefined,
      }));

  const handleSearch = async () => {
    const term = searchTerm.trim();
    if (!queueId) {
      setError('Queue context is missing. Cannot search users for assignment.');
      setResults([]);
      return;
    }
    setSearching(true);
    setError(null);
    setSelected(null);
    setHasSearched(true);
    try {
      if (restrictToQueueMembers && (!queueMemberIds || queueMemberIds.size === 0)) {
        setResults([]);
        return;
      }

      if (!term) {
        if (restrictToQueueMembers && queueMemberIds) {
          // Clear filter — re-load all queue members.
          const users = await loadUsersByIds([...queueMemberIds]);
          setResults(applyGroupBadges(users, groupIds.sysAdmin, groupIds.admin, groupIds.queue, groupIds.verifier));
          return;
        }

        const users = await searchActiveUsers('', null);
        setResults(applyGroupBadges(users, groupIds.sysAdmin, groupIds.admin, groupIds.queue, groupIds.verifier));
        return;
      }

      const users = await searchActiveUsers(term, restrictToQueueMembers ? queueMemberIds : null);
      setResults(applyGroupBadges(users, groupIds.sysAdmin, groupIds.admin, groupIds.queue, groupIds.verifier));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  // Trigger search automatically as the user types, debounced by 300 ms.
  useEffect(() => {
    const timer = setTimeout(() => { void handleSearch(); }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const handleAssign = async () => {
    if (!selected || !queueitemId) return;
    setSubmitting(true);
    setError(null);
    try {
      // Remove from queue by deleting the queue item
      await QueueitemsService.delete(queueitemId);

      onAssigned(selected.systemUserId, selected.displayName);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box assign-modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Assign Queue Item</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <p className="assign-modal-subtitle">
            Assigning: <strong>{enrolmentName}</strong>
          </p>

          {!queueitemId && (
            <p className="assign-no-queueitem">
              This enrolment has no active queue item. Refer it to the supervisor queue first.
            </p>
          )}

          {queueitemId && (
            <>
              <div className="assign-search-row">
                <input
                  className="assign-search-input"
                  type="text"
                  placeholder={queueId ? (restrictToQueueMembers ? 'Filter queue members by name…' : 'Search active users by name…') : 'Search users by name…'}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  autoFocus
                />
              </div>

              {hasSearched && !searching && results.length === 0 && (
                <p className="assign-no-results">
                  {queueId ? 'No matching queue members.' : 'No users found.'}
                </p>
              )}

              {results.length > 0 && (
                <ul className="assign-results-list">
                  {results.map(u => (
                    <li
                      key={u.systemUserId}
                      className={`assign-result-item${selected?.systemUserId === u.systemUserId ? ' selected' : ''}`}
                      onClick={() => setSelected(u)}
                    >
                      <span className="avatar-circle">{getInitials(u.displayName)}</span>
                      <span className="assign-result-info">
                        <span className="assign-result-name">
                          {u.displayName}
                          {u.group && <span className="assign-group-badge">{u.group}</span>}
                        </span>
                        {(u.jobTitle || u.mail) && (
                          <span className="assign-result-sub">{u.jobTitle ?? u.mail}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          {queueitemId && (
            <button
              type="button"
              className="btn-ok"
              disabled={!selected || submitting}
              onClick={() => void handleAssign()}
            >
              {submitting ? 'Assigning…' : 'Assign'}
            </button>
          )}
          <button type="button" className="btn-cancel" disabled={submitting} onClick={onClose}>
            Cancel
          </button>
          {error && <span className="modal-error">{error}</span>}
        </div>
      </div>
    </div>
  );
}
