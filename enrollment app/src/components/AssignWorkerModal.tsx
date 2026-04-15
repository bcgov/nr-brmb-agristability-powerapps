import { useState, useEffect } from 'react';
import { QueueitemsService } from '../generated/services/QueueitemsService';
import { SystemusersService } from '../generated/services/SystemusersService';
import { QueuemembershipsService } from '../generated/services/QueuemembershipsService';
import { getInitials } from '../utils/helpers';

export interface AssignableUser {
  systemUserId: string;
  displayName: string;
  jobTitle?: string;
  mail?: string;
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

export function AssignWorkerModal({
  enrolmentName,
  queueitemId,
  queueId,
  queueName,
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
  // queueMemberIds: set of systemuserids that belong to the queue (null = not yet loaded)
  const [queueMemberIds, setQueueMemberIds] = useState<Set<string> | null>(null);
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
        filter: `${buildUserIdOrFilter(idChunk)} and isdisabled eq false`,
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

  // Fetch queuemembership records for the queue to get the allowed user IDs, then load those users.
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
          setError(memberships.error?.message ?? 'Failed to load queue members');
          return;
        }
        const ids = new Set(
          (memberships.data ?? []).map(m => m.systemuserid).filter((id): id is string => !!id)
        );
        setQueueMemberIds(ids);
        if (ids.size === 0) {
          setResults([]);
          return;
        }
        const users = await loadUsersByIds([...ids]);
        if (cancelled) return;
        setResults(users);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load queue members');
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, queueitemId]);

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
      if (!queueMemberIds || queueMemberIds.size === 0) {
        setResults([]);
        return;
      }

      if (!term) {
        // Clear filter — re-load all queue members.
        const users = await loadUsersByIds([...queueMemberIds]);
        setResults(users);
        return;
      }

      const escaped = term.replace(/'/g, "''");
      // If we have the queue member IDs, narrow all searches to that set.
      const memberConstraint = ` and ${buildUserIdOrFilter([...queueMemberIds])}`;

      const filters = [
        `contains(fullname,'${escaped}') and isdisabled eq false${memberConstraint}`,
        `startswith(fullname,'${escaped}') and isdisabled eq false${memberConstraint}`,
        `contains(internalemailaddress,'${escaped}') and isdisabled eq false${memberConstraint}`,
        `contains(domainname,'${escaped}') and isdisabled eq false${memberConstraint}`,
      ];

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
          if (!u.systemuserid || u.isdisabled) continue;
          if (!collected.has(u.systemuserid)) {
            collected.set(u.systemuserid, {
              systemUserId: u.systemuserid,
              displayName: u.fullname ?? u.internalemailaddress ?? u.domainname ?? u.systemuserid,
              jobTitle: u.jobtitle ?? undefined,
              mail: u.internalemailaddress ?? undefined,
            });
          }
          if (collected.size >= 20) break;
        }
      }

      const finalResults = Array.from(collected.values());
      if (finalResults.length === 0 && errors.length > 0) {
        setError(errors[0]);
      }
      setResults(finalResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleAssign = async () => {
    if (!selected || !queueitemId) return;
    setSubmitting(true);
    setError(null);
    try {
      // workerid is a polymorphic lookup (systemuser or team), so the navigation
      // property name for OData binding uses the polymorphic variant suffix.
      let updateResult = await QueueitemsService.update(queueitemId, {
        'workerid_systemuser@odata.bind': `/systemusers(${selected.systemUserId})`,
      } as unknown as Parameters<typeof QueueitemsService.update>[1]);

      // Fall back to the model-declared name in case CRM version differs.
      if (!updateResult.success) {
        updateResult = await QueueitemsService.update(queueitemId, {
          'WorkerId@odata.bind': `/systemusers(${selected.systemUserId})`,
        } as Parameters<typeof QueueitemsService.update>[1]);
      }

      if (!updateResult.success) {
        throw new Error(updateResult.error?.message ?? 'Failed to save assignment to queue item.');
      }

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

          <p className="assign-queue-context">
            Queue scope: <strong>{queueName || 'Unknown queue'}</strong>
            {queueMemberIds ? ` | Members loaded: ${queueMemberIds.size}` : ''}
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
                  placeholder={queueId ? 'Filter queue members by name…' : 'Search users by name…'}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleSearch(); }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn-ok assign-search-btn"
                  onClick={() => void handleSearch()}
                  disabled={searching || !queueId}
                >
                  {searching ? '…' : 'Search'}
                </button>
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
                        <span className="assign-result-name">{u.displayName}</span>
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
