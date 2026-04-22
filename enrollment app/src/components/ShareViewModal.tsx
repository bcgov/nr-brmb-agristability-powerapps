import { useCallback, useEffect, useRef, useState } from 'react';
import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';
import { SystemusersService } from '../generated/services/SystemusersService';
import { TeamsService } from '../generated/services/TeamsService';

type PrincipalKind = 'user' | 'team';
type SearchResult = { id: string; name: string; email: string; kind: PrincipalKind };
type SharedPrincipal = { id: string; name: string; email: string; kind: PrincipalKind };

export function ShareViewModal({
  viewId,
  onClose,
}: {
  viewId: string;
  viewName: string;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [sharedWith, setSharedWith] = useState<SharedPrincipal[]>([]);
  const [selected, setSelected] = useState<SharedPrincipal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const client = getClient(dataSourcesInfo);

  // Load existing shares on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const request = {
          dataverseRequest: {
            action: 'RetrieveSharedPrincipalsAndAccess',
            parameters: {
              Target: {
                '@odata.type': 'Microsoft.Dynamics.CRM.userquery',
                userqueryid: viewId,
              },
            },
          },
        } as unknown as Parameters<typeof client.executeAsync>[0];
        const result = await client.executeAsync(request) as unknown as {
          PrincipalAccesses?: Array<{
            Principal?: { systemuserid?: string; name?: string };
          }>;
        };
        if (!cancelled && result?.PrincipalAccesses) {
          setSharedWith(
            result.PrincipalAccesses
              .map(pa => ({
                id: pa.Principal?.systemuserid ?? '',
                name: pa.Principal?.name ?? '',
                email: '',
                kind: 'user' as PrincipalKind,
              }))
              .filter(p => p.id),
          );
        }
      } catch {
        // sharing info may not be available in all environments
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setShowDropdown(!!value.trim());
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim()) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const escaped = value.replace(/'/g, "''");
        const collected = new Map<string, SearchResult>();

        // Search users
        const userFilters = [
          `contains(fullname,'${escaped}') and isdisabled eq false`,
          `contains(internalemailaddress,'${escaped}') and isdisabled eq false`,
        ];
        for (const filter of userFilters) {
          if (collected.size >= 10) break;
          const res = await SystemusersService.getAll({
            select: ['systemuserid', 'fullname', 'internalemailaddress', 'isdisabled'],
            filter,
            orderBy: ['fullname asc'],
            maxPageSize: 10,
          });
          if (!res.success) continue;
          for (const u of res.data ?? []) {
            if (!u.systemuserid || collected.has(u.systemuserid)) continue;
            collected.set(u.systemuserid, {
              id: u.systemuserid,
              name: u.fullname ?? u.internalemailaddress ?? u.systemuserid,
              email: u.internalemailaddress ?? '',
              kind: 'user',
            });
          }
        }

        // Search teams
        const teamRes = await TeamsService.getAll({
          select: ['teamid', 'name'],
          filter: `contains(name,'${escaped}')`,
          orderBy: ['name asc'],
          maxPageSize: 10,
        });
        if (teamRes.success) {
          for (const t of teamRes.data ?? []) {
            if (!t.teamid || collected.has(t.teamid)) continue;
            collected.set(t.teamid, {
              id: t.teamid,
              name: t.name ?? t.teamid,
              email: '',
              kind: 'team',
            });
          }
        }

        setResults([...collected.values()].slice(0, 10));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const handleSelectUser = (user: SearchResult) => {
    setSelected(user);
    setSearch(user.name);
    setShowDropdown(false);
    setResults([]);
  };

  const handleShare = useCallback(async () => {
    if (!selected) return;
    if (sharedWith.some(p => p.id === selected.id)) {
      setError('This user already has access to this view.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const principalType = selected.kind === 'team'
        ? 'Microsoft.Dynamics.CRM.team'
        : 'Microsoft.Dynamics.CRM.systemuser';
      const principalIdField = selected.kind === 'team' ? 'teamid' : 'systemuserid';
      const request = {
        dataverseRequest: {
          action: 'GrantAccess',
          parameters: {
            Target: {
              '@odata.type': 'Microsoft.Dynamics.CRM.userquery',
              userqueryid: viewId,
            },
            PrincipalAccess: {
              Principal: {
                '@odata.type': principalType,
                [principalIdField]: selected.id,
              },
              AccessMask: 'ReadAccess',
            },
          },
        },
      } as unknown as Parameters<typeof client.executeAsync>[0];
      await client.executeAsync(request);
      setSharedWith(prev => [...prev, selected]);
      setSelected(null);
      setSearch('');
    } catch {
      setError('Failed to share view. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [viewId, selected, sharedWith, client]);

  const handleRevoke = useCallback(async (principalId: string) => {
    setSaving(true);
    setError(null);
    try {
      const request = {
        dataverseRequest: {
          action: 'RevokeAccess',
          parameters: {
            Target: {
              '@odata.type': 'Microsoft.Dynamics.CRM.userquery',
              userqueryid: viewId,
            },
            Revokee: {
              '@odata.type': 'Microsoft.Dynamics.CRM.systemuser',
              systemuserid: principalId,
            },
          },
        },
      } as unknown as Parameters<typeof client.executeAsync>[0];
      await client.executeAsync(request);
      setSharedWith(prev => prev.filter(p => p.id !== principalId));
    } catch {
      setError('Failed to remove access. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [viewId, client]);

  return (
    <div className="share-modal-backdrop" onClick={onClose}>
      <div className="share-modal" onClick={e => e.stopPropagation()}>
        <div className="share-modal-header">
          <h2 className="share-modal-title">Share records</h2>
          <button className="share-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="share-modal-subtitle">
          Manage who can see your record and how much access they get.
          <br />
          Changes made to all users or teams will be shared and options saved after clicking on the Share button.
        </p>
        {error && <div className="share-modal-error">{error}</div>}
        <div className="share-modal-body">
          <div className="share-modal-left">
            <div className="share-field-label">Add user/team</div>
            <div className="share-search-wrapper">
              <input
                className="share-search-input"
                type="text"
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                onFocus={() => { if (search.trim()) setShowDropdown(true); }}
                placeholder="---"
                autoComplete="off"
              />
              <span className="share-search-icon">&#x1F50D;</span>
              {showDropdown && (
                <div className="share-search-dropdown">
                  {searching && <div className="share-search-hint">Searching…</div>}
                  {!searching && search && results.length === 0 && (
                    <div className="share-search-hint">No users found</div>
                  )}
                  {!searching && results.length > 0 && (
                    <div className="share-search-hint share-search-browse">
                      Type to search or press Enter to browse
                    </div>
                  )}
                  {!searching && results.map(r => (
                    <button
                      key={r.id}
                      className="share-search-result"
                      onClick={() => handleSelectUser(r)}
                    >
                      <span className="share-result-avatar">{r.kind === 'team' ? '👥' : r.name.charAt(0).toUpperCase()}</span>
                      <span className="share-result-info">
                        <span className="share-result-name">{r.name}{r.kind === 'team' ? ' (Team)' : ''}</span>
                        {r.email && <span className="share-result-email">{r.email}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading && <div className="share-loading">Loading…</div>}
            {!loading && sharedWith.length === 0 && !selected && (
              <div className="share-empty">Not shared with anyone yet.</div>
            )}
            {sharedWith.map(p => (
              <div key={p.id} className="share-principal-row">
                <span className="share-principal-avatar">{p.kind === 'team' ? '👥' : p.name.charAt(0).toUpperCase()}</span>
                <div className="share-principal-info">
                  <span className="share-principal-name">{p.name}</span>
                  {p.email && <span className="share-principal-email">{p.email}</span>}
                </div>
                <span className="share-principal-access">Read</span>
                <button
                  className="share-principal-remove"
                  onClick={() => handleRevoke(p.id)}
                  disabled={saving}
                  title="Remove access"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="share-modal-right">
            {selected ? (
              <div className="share-permissions-panel">
                <div className="share-permissions-user">
                  <span className="share-principal-avatar">{selected.name.charAt(0).toUpperCase()}</span>
                  <span className="share-principal-name">{selected.name}</span>
                </div>
                <div className="share-permissions-label">Permission(s)</div>
                <div className="share-permission-row">
                  <input type="checkbox" id="perm-read" checked readOnly />
                  <label htmlFor="perm-read">Read</label>
                </div>
              </div>
            ) : (
              <div className="share-permissions-empty">
                Select a person or group to assign their permission(s)
              </div>
            )}
          </div>
        </div>

        <div className="share-modal-footer">
          {selected && (
            <button
              className="share-btn-share"
              onClick={handleShare}
              disabled={saving}
            >
              {saving ? 'Sharing…' : 'Share'}
            </button>
          )}
          <button className="share-btn-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
