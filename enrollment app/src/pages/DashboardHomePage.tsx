import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';

import type { SortKey, SortDir, FilterOperator, AdvFilterNode, LogicOp, QuickFilterState } from '../types/enrollment';
import { DEFAULT_VISIBLE_KEYS } from '../constants/columns';
import { countActiveNodes } from '../utils/filterTree';
import { useEnrolmentData, useSortedAndFilteredRows } from '../hooks/useEnrolmentData';
import { useViews } from '../hooks/useViews';

import { ViewsMenu } from '../components/ViewsMenu';
import { EditColumnsPanel } from '../components/EditColumnsPanel';
import { EditFiltersPanel } from '../components/EditFiltersPanel';
import { BulkNoticesModal } from '../components/BulkNoticesModal';
import { ReferToSupervisorModal } from '../components/ReferToSupervisorModal';
import { ApproveCalculatedFeesModal } from '../components/ApproveCalculatedFeesModal';
import { EnrollmentSearchBar } from '../components/EnrollmentSearchBar';
import { EnrolmentQuickFilters } from '../components/EnrolmentQuickFilters';
import { EnrolmentDataTable } from '../components/EnrolmentDataTable';
import { EnrolmentPagination } from '../components/EnrolmentPagination';
import { EnrolmentActionsBar } from '../components/EnrolmentActionsBar';
import { Office365UsersService } from '../generated/services/Office365UsersService';
import { SystemusersService } from '../generated/services/SystemusersService';
import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';
import { resolveAuthenticatedEmail, resolveCurrentSystemUser } from '../utils/currentUser';

const PAGE_SIZE = 20;

type ResolvedProfile = {
  id: string;
  name: string;
  email: string;
  source: string;
};

type XrmUserSettings = { userId?: string; userName?: string; userPrincipalName?: string };
type WinWithXrm = { Xrm?: { Utility?: { getGlobalContext?: () => { userSettings?: XrmUserSettings } } } };

function getXrmUserSettings(): XrmUserSettings | undefined {
  const candidates = [window, window.parent, window.top];
  for (const w of candidates) {
    try {
      if (!w) continue;
      const settings = (w as unknown as WinWithXrm).Xrm?.Utility?.getGlobalContext?.()?.userSettings;
      if (settings?.userId || settings?.userName || settings?.userPrincipalName) return settings;
    } catch {
      // ignore cross-origin frame access and keep trying
    }
  }
  return undefined;
}

export function DashboardHomePage() {
  const { rows, setRows, loading, error, avatarUrls, fetchEnrolments, coreAppId, fetchCoreAppId } = useEnrolmentData();
  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState<ResolvedProfile | null>(null);

  const welcomeName = useMemo(() => {
    const profileName = profile?.name?.trim();
    if (profileName) return profileName;

    const xrmSettings = getXrmUserSettings();
    const xrmName = xrmSettings?.userName?.trim();
    if (xrmName) return xrmName;

    const emailCandidate = profile?.email?.trim() || xrmSettings?.userPrincipalName?.trim();
    if (emailCandidate && emailCandidate.includes('@')) {
      return emailCandidate.split('@')[0].trim();
    }

    return '';
  }, [profile]);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setProfileLoading(true);
      const xrmSettings = getXrmUserSettings();
      try {
        // Reuse the same identity resolution path used by approval actions.
        const currentUser = await resolveCurrentSystemUser();
        if (active && currentUser.displayName?.trim()) {
          setProfile({
            id: currentUser.systemUserId,
            name: currentUser.displayName,
            email: currentUser.email ?? '',
            source: 'resolveCurrentSystemUser',
          });
          return;
        }
      } catch {
        // fall through to legacy lookup path below
      }

      try {
        const hasText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
        const authenticatedEmail = await resolveAuthenticatedEmail();

        const pickPayload = (input: unknown): Record<string, unknown> | null => {
          const queue: unknown[] = [input];
          const seen = new Set<object>();
          let fallback: Record<string, unknown> | null = null;

          const profileKeys = new Set([
            'id', 'Id', 'userid', 'UserId',
            'displayName', 'DisplayName', 'fullName', 'fullname', 'userName',
            'mail', 'Mail', 'internalemailaddress', 'internalEmailAddress',
            'userPrincipalName', 'UserPrincipalName', 'domainname',
          ]);

          while (queue.length > 0) {
            const current = queue.shift();
            if (!current || typeof current !== 'object' || Array.isArray(current)) continue;

            const obj = current as Record<string, unknown>;
            if (seen.has(obj)) continue;
            seen.add(obj);

            if (!fallback) fallback = obj;

            const keys = Object.keys(obj);
            if (keys.some((k) => profileKeys.has(k))) {
              return obj;
            }

            queue.push(obj.data);
            queue.push(obj.value);
          }

          return fallback;
        };

        const buildFromPayload = (payload: Record<string, unknown> | null, source: string): ResolvedProfile | null => {
          if (!payload) return null;

          const id = [payload.id, payload.Id, payload.userid, payload.UserId]
            .find(hasText);
          const upn = [payload.userPrincipalName, payload.UserPrincipalName]
            .find(hasText);
          const name = [payload.displayName, payload.DisplayName, payload.fullname, payload.fullName, payload.userName]
            .find(hasText);
          const email = [payload.mail, payload.Mail, payload.internalemailaddress, payload.internalEmailAddress, upn]
            .find(hasText);

          if (!id && !name && !email) return null;
          return {
            id: id ? id.trim() : (email ? email.trim() : 'N/A'),
            name: name ? name.trim() : (upn ? upn.trim() : 'N/A'),
            email: email ? email.trim() : (upn ? upn.trim() : 'N/A'),
            source,
          };
        };

        const fromV2 = async (withSelect: boolean): Promise<ResolvedProfile | null> => {
          try {
            const result = withSelect
              ? await Office365UsersService.MyProfile_V2('id,displayName,mail,userPrincipalName')
              : await Office365UsersService.MyProfile_V2();
            const payload = pickPayload(result as unknown);
            const resolved = buildFromPayload(payload, withSelect ? 'Office365 MyProfile_V2(select)' : 'Office365 MyProfile_V2');
            return resolved;
          } catch {
            return null;
          }
        };

        const fromV1 = async (): Promise<ResolvedProfile | null> => {
          try {
            const result = await Office365UsersService.MyProfile();
            const payload = pickPayload(result as unknown);
            const resolved = buildFromPayload(payload, 'Office365 MyProfile');
            return resolved;
          } catch {
            return null;
          }
        };

        const fromWhoAmI = async (): Promise<ResolvedProfile | null> => {
          try {
            const client = getClient(dataSourcesInfo);
            const whoAmIRequest = {
              dataverseRequest: {
                action: 'WhoAmI',
                parameters: {},
              },
            } as unknown as Parameters<typeof client.executeAsync>[0];

            const whoAmIResult = await client.executeAsync(whoAmIRequest) as unknown;
            const whoAmIPayload = pickPayload(whoAmIResult);
            const rawUserId = whoAmIPayload?.UserId ?? whoAmIPayload?.userid ?? whoAmIPayload?.userId;
            const userId = hasText(rawUserId) ? rawUserId.replace(/[{}]/g, '').trim() : '';
            if (!hasText(userId)) return null;

            const sys = await SystemusersService.get(userId, {
              select: ['fullname', 'internalemailaddress', 'domainname'],
            });
            const sysPayload = pickPayload(sys as unknown);
            const resolved = buildFromPayload({ ...(sysPayload ?? {}), UserId: userId }, 'Dataverse WhoAmI');
            return resolved;
          } catch {
            return null;
          }
        };

        const fromAuthenticatedEmail = async (): Promise<ResolvedProfile | null> => {
          try {
            const email = await resolveAuthenticatedEmail();
            if (!email) return null;

            const escaped = email.replace(/'/g, "''");
            const byEmail = await SystemusersService.getAll({
              select: ['systemuserid', 'fullname', 'internalemailaddress', 'domainname'],
              filter: `internalemailaddress eq '${escaped}' and isdisabled eq false`,
              maxPageSize: 1,
            });

            const match = byEmail.data?.[0];
            if (!match) {
              return {
                id: email,
                name: email,
                email,
                source: 'Auth email context',
              };
            }

            return {
              id: match.systemuserid || email,
              name: match.fullname || match.domainname || email,
              email: match.internalemailaddress || match.domainname || email,
              source: 'Auth email + systemusers',
            };
          } catch {
            return null;
          }
        };

        const fromXrmContext = (): ResolvedProfile | null => {
          try {
            const settings = getXrmUserSettings();
            const userId = settings?.userId?.replace(/[{}]/g, '').trim();
            const userName = settings?.userName?.trim();
            const upn = settings?.userPrincipalName?.trim();
            if (!hasText(userId) && !hasText(userName) && !hasText(upn)) return null;

            return {
              id: userId || upn || 'N/A',
              name: userName || upn || 'N/A',
              email: upn || 'N/A',
              source: 'Xrm global context',
            };
          } catch {
            return null;
          }
        };

        const resolved = (await fromV2(true)) ?? (await fromV2(false)) ?? (await fromV1()) ?? (await fromWhoAmI()) ?? (await fromAuthenticatedEmail()) ?? fromXrmContext();
        if (!active) return;

        setProfile(resolved);
      } catch {
        if (active) {
          setProfile(null);
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, []);
  // Refresh handler for manual reload
  const handleRefresh = useCallback(() => {
    if (typeof fetchEnrolments === 'function') fetchEnrolments();
    if (typeof fetchCoreAppId === 'function') fetchCoreAppId();
  }, [fetchEnrolments, fetchCoreAppId]);

  // Column & sort state
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<SortKey[]>([...DEFAULT_VISIBLE_KEYS]);
  const [columnWidths, setColumnWidths] = useState<Partial<Record<SortKey, number>>>({});
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Filter state
  const [filters, setFilters] = useState<QuickFilterState>({
    verifiedCalc: false,
    unverifiedCalc: false,
    flagged: false,
    partnerships: false,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<Set<string>>(new Set());
  const [enrolStatusFilter, setEnrolStatusFilter] = useState<Set<string>>(new Set());
  const [taskFilterOp, setTaskFilterOp] = useState<FilterOperator>('equals');
  const [enrolFilterOp, setEnrolFilterOp] = useState<FilterOperator>('equals');
  const [advFilterNodes, setAdvFilterNodes] = useState<AdvFilterNode[]>([]);
  const [advLogicOp, setAdvLogicOp] = useState<LogicOp>('AND');

  // Pagination & selection
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Panel visibility
  const [showEditColumns, setShowEditColumns] = useState(false);
  const [showEditFilters, setShowEditFilters] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [showApproveFeesModal, setShowApproveFeesModal] = useState(false);

  const setFiltersAndReset = useCallback((next: QuickFilterState) => {
    setFilters(next);
    setCurrentPage(1);
  }, []);
  const setTaskStatusFilterAndReset = useCallback((next: Set<string>) => {
    setTaskStatusFilter(next);
    setCurrentPage(1);
  }, []);
  const setEnrolStatusFilterAndReset = useCallback((next: Set<string>) => {
    setEnrolStatusFilter(next);
    setCurrentPage(1);
  }, []);
  const setTaskFilterOpAndReset = useCallback((next: FilterOperator) => {
    setTaskFilterOp(next);
    setCurrentPage(1);
  }, []);
  const setEnrolFilterOpAndReset = useCallback((next: FilterOperator) => {
    setEnrolFilterOp(next);
    setCurrentPage(1);
  }, []);
  const setAdvFilterNodesAndReset = useCallback((next: AdvFilterNode[]) => {
    setAdvFilterNodes(next);
    setCurrentPage(1);
  }, []);
  const setAdvLogicOpAndReset = useCallback((next: LogicOp) => {
    setAdvLogicOp(next);
    setCurrentPage(1);
  }, []);

  // Column drag-and-drop
  const [colDragIdx, setColDragIdx] = useState<number | null>(null);
  const handleColDragStart = (i: number) => setColDragIdx(i);
  const handleColDragOver = (e: DragEvent, i: number) => {
    e.preventDefault();
    if (colDragIdx === null || colDragIdx === i) return;
    setVisibleColumnKeys(prev => {
      const next = [...prev];
      const [moved] = next.splice(colDragIdx, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setColDragIdx(i);
  };
  const handleColDragEnd = () => setColDragIdx(null);

  // Views hook
  const viewSetters = useMemo(() => ({
    setVisibleColumnKeys, setColumnWidths, setSortKey, setSortDir,
    setFilters: setFiltersAndReset,
    setTaskStatusFilter: setTaskStatusFilterAndReset,
    setEnrolStatusFilter: setEnrolStatusFilterAndReset,
    setTaskFilterOp: setTaskFilterOpAndReset,
    setEnrolFilterOp: setEnrolFilterOpAndReset,
    setAdvFilterNodes: setAdvFilterNodesAndReset,
    setAdvLogicOp: setAdvLogicOpAndReset,
  }), [
    setFiltersAndReset,
    setTaskStatusFilterAndReset,
    setEnrolStatusFilterAndReset,
    setTaskFilterOpAndReset,
    setEnrolFilterOpAndReset,
    setAdvFilterNodesAndReset,
    setAdvLogicOpAndReset,
  ]);

  const viewState = useMemo(() => ({
    visibleColumnKeys, columnWidths, sortKey, sortDir, filters,
    taskStatusFilter, enrolStatusFilter, taskFilterOp, enrolFilterOp,
    advFilterNodes, advLogicOp,
  }), [visibleColumnKeys, columnWidths, sortKey, sortDir, filters,
    taskStatusFilter, enrolStatusFilter, taskFilterOp, enrolFilterOp,
    advFilterNodes, advLogicOp]);

  const {
    savedViews, viewsLoading, activeViewId, hasUnsavedChanges,
    handleSelectView, handleSaveAsNew, handleSaveCurrentView,
    handleDeleteView, handleRenameView, handleResetDefault,
  } = useViews(viewState, viewSetters);

  // Sorting & filtering
  const { filteredRows, taskStatusOptions, enrolStatusOptions } = useSortedAndFilteredRows(
    rows, sortKey, sortDir, filters,
    taskStatusFilter, enrolStatusFilter, taskFilterOp, enrolFilterOp,
    advFilterNodes, advLogicOp,
  );

  const searchedRows = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return filteredRows;

    return filteredRows.filter((row) => {
      const raw = row as unknown as Record<string, unknown>;
      const pin = row.vsi_name ?? '';
      const participant = (row.vsi_participantidname ?? raw['_vsi_participantid_value@OData.Community.Display.V1.FormattedValue'] ?? '') as string;
      const farmCorp = (row.new_combinedfarmname ?? row.vsi_partnershipnames ?? '') as string;

      return [pin, participant, farmCorp].some((value) => String(value).toLowerCase().includes(term));
    });
  }, [filteredRows, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(searchedRows.length / PAGE_SIZE));
  const pagedRows = searchedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const allPageSelected = pagedRows.length > 0 && pagedRows.every(r => selectedIds.has(r.vsi_participantprogramyearid));
  const somePageSelected = pagedRows.some(r => selectedIds.has(r.vsi_participantprogramyearid));

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        pagedRows.forEach(r => next.delete(r.vsi_participantprogramyearid));
      } else {
        pagedRows.forEach(r => next.add(r.vsi_participantprogramyearid));
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleFilter = (key: keyof QuickFilterState) => {
    setFilters(current => ({ ...current, [key]: !current[key] }));
    setCurrentPage(1);
  };

  const setSort = (key: SortKey, dir: SortDir) => { setSortKey(key); setSortDir(dir); };

  const setColumnWidth = (key: SortKey) => (w: number | undefined) =>
    setColumnWidths(prev => {
      const next = { ...prev };
      if (w === undefined) delete next[key]; else next[key] = w;
      return next;
    });

  return (
    <div className="enrolment-wrapper">
      <div
        className="dashboard-welcome"
        aria-label="Welcome message"
        title={profileLoading ? 'Loading profile...' : undefined}
      >
        {`Welcome${welcomeName ? ` ${welcomeName}` : ''}`}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button type="button" onClick={handleRefresh} disabled={loading} style={{ padding: '6px 16px', borderRadius: 4, border: '1px solid #ccc', background: '#f7f7f7', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <ViewsMenu
        views={savedViews}
        activeViewId={activeViewId}
        hasUnsavedChanges={hasUnsavedChanges}
        onSelectView={handleSelectView}
        onSaveAsNew={handleSaveAsNew}
        onSaveCurrentView={handleSaveCurrentView}
        onResetDefault={handleResetDefault}
        onDeleteView={handleDeleteView}
        onRenameView={handleRenameView}
        viewsLoading={viewsLoading}
      />

      {loading && <p className="enrolment-loading">Loading…</p>}
      {error && <p className="enrolment-error">{error}</p>}

      {!loading && !error && (
        <>
          <EnrollmentSearchBar
            value={searchQuery}
            onChange={(nextValue) => {
              setSearchQuery(nextValue);
              setCurrentPage(1);
            }}
          />

          <EnrolmentQuickFilters
            filters={filters}
            onToggleFilter={toggleFilter}
            onOpenEditColumns={() => setShowEditColumns(true)}
            onOpenEditFilters={() => setShowEditFilters(true)}
            activeAdvancedCount={countActiveNodes(advFilterNodes)}
          />

          <EnrolmentDataTable
            allRowsCount={rows.length}
            pagedRows={pagedRows}
            visibleColumnKeys={visibleColumnKeys}
            allPageSelected={allPageSelected}
            somePageSelected={somePageSelected}
            onToggleSelectAll={toggleSelectAll}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            colDragIdx={colDragIdx}
            onColDragStart={handleColDragStart}
            onColDragOver={handleColDragOver}
            onColDragEnd={handleColDragEnd}
            taskStatusOptions={taskStatusOptions}
            taskStatusFilter={taskStatusFilter}
            taskFilterOp={taskFilterOp}
            onTaskStatusFilterChange={setTaskStatusFilterAndReset}
            onTaskFilterOperatorChange={setTaskFilterOpAndReset}
            enrolStatusOptions={enrolStatusOptions}
            enrolStatusFilter={enrolStatusFilter}
            enrolFilterOp={enrolFilterOp}
            onEnrolStatusFilterChange={setEnrolStatusFilterAndReset}
            onEnrolFilterOperatorChange={setEnrolFilterOpAndReset}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={setSort}
            columnWidths={columnWidths}
            onColumnWidthChange={setColumnWidth}
            avatarUrls={avatarUrls}
            coreAppId={coreAppId}
          />

          <EnrolmentPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={searchedRows.length}
            onFirstPage={() => setCurrentPage(1)}
            onPrevPage={() => setCurrentPage(previous => previous - 1)}
            onNextPage={() => setCurrentPage(previous => previous + 1)}
            onLastPage={() => setCurrentPage(totalPages)}
          />

          <EnrolmentActionsBar
            onOpenBulkNotices={() => setShowBulkModal(true)}
            onOpenReferToSupervisor={() => setShowSupervisorModal(true)}
            onOpenApproveCalculatedFees={() => setShowApproveFeesModal(true)}
          />

          {showApproveFeesModal && (
            <ApproveCalculatedFeesModal
              selectedIds={selectedIds}
              rows={rows}
              onClose={() => setShowApproveFeesModal(false)}
              onComplete={(updates) => {
                const updatesById = new Map(updates.map(update => [update.id, update]));
                setRows(prev => prev.map(r => {
                  const update = updatesById.get(r.vsi_participantprogramyearid);
                  if (!update) return r;

                  return {
                    ...r,
                    vsi_taskstatus: 865520003,
                    vsi_taskstatusapproveddate: update.approvedDate,
                    vsi_taskstatusapprovername: update.approverName,
                    _vsi_taskstatusapprover_value: update.approverId,
                  };
                }));
                setSelectedIds(new Set());
              }}
            />
          )}
        </>
      )}

      {showEditColumns && (
        <EditColumnsPanel
          visibleKeys={visibleColumnKeys}
          onApply={(keys) => { setVisibleColumnKeys(keys); setShowEditColumns(false); }}
          onCancel={() => setShowEditColumns(false)}
        />
      )}
      {showEditFilters && (
        <EditFiltersPanel
          filterNodes={advFilterNodes}
          logicOp={advLogicOp}
          onApply={(nodes, logic) => {
            setAdvFilterNodesAndReset(nodes);
            setAdvLogicOpAndReset(logic);
            setShowEditFilters(false);
          }}
          onCancel={() => setShowEditFilters(false)}
        />
      )}
      {showBulkModal && (
        <BulkNoticesModal
          selectedIds={selectedIds}
          rows={rows}
          onClose={() => setShowBulkModal(false)}
        />
      )}
      {showSupervisorModal && (
        <ReferToSupervisorModal
          selectedIds={selectedIds}
          rows={rows}
          onClose={() => setShowSupervisorModal(false)}
          onComplete={(updatedIds) => {
            setRows(prev => prev.map(r =>
              updatedIds.includes(r.vsi_participantprogramyearid)
                ? { ...r, vsi_taskstatus: 865520001 }
                : r
            ));
            setSelectedIds(new Set());
          }}
        />
      )}
    </div>
  );
}
