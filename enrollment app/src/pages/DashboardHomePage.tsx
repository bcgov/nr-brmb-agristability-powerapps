import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Columns2, Filter, FilterX, Info, RefreshCw } from 'lucide-react';

import type { SortKey, SortDir, FilterOperator, AdvFilterNode, LogicOp, QuickFilterState } from '../types/enrollment';
import { DEFAULT_VISIBLE_KEYS, SORTKEY_TO_FIELD } from '../constants/columns';
import { countActiveNodes } from '../utils/filterTree';
import { useEnrolmentData, useSortedAndFilteredRows, clearEnrolmentCache } from '../hooks/useEnrolmentData';
import { useRole } from '../context/RoleContext';
import { resolveCurrentSystemUser } from '../utils/currentUser';
import { clearSaCache } from './SupervisorApprovalPage';
import { useViews } from '../hooks/useViews';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { Vsi_programyearsService } from '../generated/services/Vsi_programyearsService';
import {
  Vsi_participantprogramyearsvsi_enrolmentstatus,
  Vsi_participantprogramyearsvsi_taskstatus,
} from '../generated/models/Vsi_participantprogramyearsModel';

import { ViewsMenu } from '../components/ViewsMenu';
import { EditColumnsPanel } from '../components/EditColumnsPanel';
import { EditFiltersPanel } from '../components/EditFiltersPanel';
import { BulkNoticesModal } from '../components/BulkNoticesModal';
import { BulkEditEnrolmentsModal } from '../components/BulkEditEnrolmentsModal';
import { AssignOwnerModal } from '../components/AssignOwnerModal';
import { ReferToSupervisorModal } from '../components/ReferToSupervisorModal';
import { ApproveCalculatedFeesModal } from '../components/ApproveCalculatedFeesModal';
import { Toast, nextToastId } from '../components/Toast';
import type { ToastMessage } from '../components/Toast';
import { EnrollmentSearchBar } from '../components/EnrollmentSearchBar';
import { EnrolmentQuickFilters } from '../components/EnrolmentQuickFilters';
import { EnrolmentDataTable } from '../components/EnrolmentDataTable';

import { EnrolmentActionsBar } from '../components/EnrolmentActionsBar';

// Module-level cache — persists filter/sort/pagination state across SPA navigations.
type DashboardFilterCache = {
  visibleColumnKeys: SortKey[];
  columnWidths: Partial<Record<SortKey, number>>;
  sortKey: SortKey | null;
  sortDir: SortDir;
  filters: QuickFilterState;
  searchQuery: string;
  taskStatusFilter: Set<string>;
  enrolStatusFilter: Set<string>;
  yearFilter: Set<string>;
  ownerFilter: Set<string>;
  taskFilterOp: FilterOperator;
  enrolFilterOp: FilterOperator;
  advFilterNodes: AdvFilterNode[];
  advLogicOp: LogicOp;
  currentPage: number;
};
let dashboardFilterCache: DashboardFilterCache | null = null;

function parseProgramYearStart(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const direct = Number(trimmed);
  if (Number.isFinite(direct)) return Math.trunc(direct);
  const match = trimmed.match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

export function DashboardHomePage() {
  const { activeRole, demoQueryMode, demoYearsWindow } = useRole();
  const { rows, setRows, loading, pageSize, error, avatarUrls, fetchEnrolments, coreAppId, coreBaseUrl, fetchCoreAppId } = useEnrolmentData();

  // Refresh handler is defined after useViews so reloadViews is available

  // Column & sort state
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<SortKey[]>(() => dashboardFilterCache?.visibleColumnKeys ?? [...DEFAULT_VISIBLE_KEYS]);
  const [columnWidths, setColumnWidths] = useState<Partial<Record<SortKey, number>>>(() => dashboardFilterCache?.columnWidths ?? {});
  const [sortKey, setSortKey] = useState<SortKey | null>(() => dashboardFilterCache?.sortKey ?? 'modifiedOn');
  const [sortDir, setSortDir] = useState<SortDir>(() => dashboardFilterCache?.sortDir ?? 'desc');

  // Filter state
  const [filters, setFilters] = useState<QuickFilterState>(() => dashboardFilterCache?.filters ?? {
    verifiedCalc: false,
    unverifiedCalc: false,
    flagged: false,
    partnerships: false,
    fortyFiveDayLetter: false,
    varianceAlert: false,
  });
  const [searchQuery, setSearchQuery] = useState(() => dashboardFilterCache?.searchQuery ?? '');
  const [taskStatusFilter, setTaskStatusFilter] = useState<Set<string>>(() => dashboardFilterCache?.taskStatusFilter ?? new Set());
  const [enrolStatusFilter, setEnrolStatusFilter] = useState<Set<string>>(() => dashboardFilterCache?.enrolStatusFilter ?? new Set());
  const [yearFilter, setYearFilter] = useState<Set<string>>(() => dashboardFilterCache?.yearFilter ?? new Set());
  const [ownerFilter, setOwnerFilter] = useState<Set<string>>(() => dashboardFilterCache?.ownerFilter ?? new Set());
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState<string | null>(null);

  useEffect(() => {
    resolveCurrentSystemUser().then(u => setCurrentUserDisplayName(u.displayName)).catch(() => {});
  }, []);
  const [taskFilterOp, setTaskFilterOp] = useState<FilterOperator>(() => dashboardFilterCache?.taskFilterOp ?? 'equals');
  const [enrolFilterOp, setEnrolFilterOp] = useState<FilterOperator>(() => dashboardFilterCache?.enrolFilterOp ?? 'equals');
  const [advFilterNodes, setAdvFilterNodes] = useState<AdvFilterNode[]>(() => dashboardFilterCache?.advFilterNodes ?? []);
  const [advLogicOp, setAdvLogicOp] = useState<LogicOp>(() => dashboardFilterCache?.advLogicOp ?? 'AND');

  // Pagination & selection
  const [currentPage, setCurrentPage] = useState(() => dashboardFilterCache?.currentPage ?? 1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Panel visibility
  const [showEditColumns, setShowEditColumns] = useState(false);
  const [showEditFilters, setShowEditFilters] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [showApproveFeesModal, setShowApproveFeesModal] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [newParticipantCount, setNewParticipantCount] = useState<number>(0);
  const [pendingSupervisorCount, setPendingSupervisorCount] = useState<number>(0);
  const [deadlineReminderCount, setDeadlineReminderCount] = useState<number>(0);
  const [serverTotalResults, setServerTotalResults] = useState<number>(0);
  const [programYearIdsByLabel, setProgramYearIdsByLabel] = useState<Record<string, string[]>>({});
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(() => dashboardFilterCache?.searchQuery ?? '');

  const taskStatusCodeByLabel = useMemo(() => {
    const entries = Object.entries(Vsi_participantprogramyearsvsi_taskstatus).map(([code, label]) => [label, Number(code)] as const);
    return new Map<string, number>(entries);
  }, []);

  const enrolStatusCodeByLabel = useMemo(() => {
    const entries = Object.entries(Vsi_participantprogramyearsvsi_enrolmentstatus).map(([code, label]) => [label, Number(code)] as const);
    return new Map<string, number>(entries);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    clearEnrolmentCache();
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [demoQueryMode, demoYearsWindow]);

  useEffect(() => {
    if (demoQueryMode !== 'client') return;
    void fetchEnrolments({ mode: 'client', yearsBack: demoYearsWindow });
  }, [demoQueryMode, demoYearsWindow, fetchEnrolments]);

  const getRecentProgramYearMetadata = useCallback(async (): Promise<{ cutoffYear: number; ids: string[]; idsByLabel: Record<string, string[]> }> => {
    const cutoffYear = new Date().getFullYear() - (demoYearsWindow - 1);
    const ids: string[] = [];
    const idsByLabel: Record<string, string[]> = {};
    let skipToken: string | undefined;
    do {
      const result = await Vsi_programyearsService.getAll({
        maxPageSize: 5000,
        select: ['vsi_programyearid', 'vsi_year'],
        ...(skipToken ? { skipToken } : {}),
      });
      const rowsForBatch = result.data ?? [];
      for (const row of rowsForBatch) {
        const yearNum = parseProgramYearStart(row.vsi_year);
        if (yearNum == null || yearNum < cutoffYear || !row.vsi_programyearid) continue;
        const cleanId = row.vsi_programyearid.replace(/[{}]/g, '').toLowerCase();
        ids.push(cleanId);
        const label = String(row.vsi_year ?? '').trim();
        if (label) {
          const existing = idsByLabel[label] ?? [];
          if (!existing.includes(cleanId)) {
            idsByLabel[label] = [...existing, cleanId];
          }
        }
      }
      const raw = result as unknown as Record<string, unknown>;
      skipToken = (raw['skipToken'] ?? raw['@odata.nextLink']) as string | undefined;
    } while (skipToken);

    return { cutoffYear, ids, idsByLabel };
  }, [demoYearsWindow]);

  const getRecentProgramYearFilter = useCallback(async (): Promise<string> => {
    const { cutoffYear, ids } = await getRecentProgramYearMetadata();

    return ids.length > 0
      ? `(${ids.map(id => `_vsi_programyearid_value eq ${id}`).join(' or ')})`
      : `vsi_programyearidname ge '${cutoffYear}'`;
  }, [getRecentProgramYearMetadata]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { idsByLabel } = await getRecentProgramYearMetadata();
        if (!cancelled) setProgramYearIdsByLabel(idsByLabel);
      } catch {
        if (!cancelled) setProgramYearIdsByLabel({});
      }
    })();
    return () => { cancelled = true; };
  }, [getRecentProgramYearMetadata]);

  const escapeODataLiteral = useCallback((value: string) => value.replace(/'/g, "''"), []);

  const buildProgramYearLookupClause = useCallback((yearLabels: string[]): string => {
    const ids = [...new Set(yearLabels.flatMap((label) => programYearIdsByLabel[label] ?? []))];
    if (ids.length === 0) return '';
    return `(${ids.map(id => `_vsi_programyearid_value eq ${id}`).join(' or ')})`;
  }, [programYearIdsByLabel]);

  const serverOrderBy = useMemo(() => {
    const normalizedKey = sortKey ?? 'modifiedOn';
    if (normalizedKey === 'producer') return [`_vsi_participantid_value ${sortDir}`];
    if (normalizedKey === 'year') return [`_vsi_programyearid_value ${sortDir}`];
    if (normalizedKey === 'owner') return [`_ownerid_value ${sortDir}`];
    if (normalizedKey === 'flagged') return [`modifiedon desc`];
    const field = SORTKEY_TO_FIELD[normalizedKey] ?? 'modifiedon';
    return [`${field} ${sortDir}`];
  }, [sortKey, sortDir]);

  const buildServerFilter = useMemo(() => {
    const clauses: string[] = [];

    if (filters.verifiedCalc) clauses.push('vsi_enrolmentstatus eq 865520006');
    if (filters.unverifiedCalc) clauses.push('vsi_enrolmentstatus eq 865520005');
    if (filters.fortyFiveDayLetter) clauses.push('vsi_enrolmentstatus eq 865520010');
    if (filters.partnerships) clauses.push('(vsi_haspartners eq true or vsi_incombinedfarm eq true)');
    if (filters.flagged) {
      clauses.push('(vsi_prevyearpartnotverified eq true or (vsi_enrolmentfee ne null and vsi_previousyearcalculatedenfee eq null) or (vsi_variancecalculation ge 0.15 or vsi_variancecalculation le -0.15))');
    }

    const taskCodes = [...taskStatusFilter]
      .map(label => taskStatusCodeByLabel.get(label))
      .filter((code): code is number => Number.isFinite(code));
    if (taskCodes.length > 0) {
      const taskClause = `(${taskCodes.map(code => `vsi_taskstatus eq ${code}`).join(' or ')})`;
      clauses.push(taskFilterOp === 'equals' ? taskClause : `not ${taskClause}`);
    }

    const enrolCodes = [...enrolStatusFilter]
      .map(label => enrolStatusCodeByLabel.get(label))
      .filter((code): code is number => Number.isFinite(code));
    if (enrolCodes.length > 0) {
      const enrolClause = `(${enrolCodes.map(code => `vsi_enrolmentstatus eq ${code}`).join(' or ')})`;
      clauses.push(enrolFilterOp === 'equals' ? enrolClause : `not ${enrolClause}`);
    }

    if (yearFilter.size > 0) {
      const yearClause = buildProgramYearLookupClause([...yearFilter]);
      if (yearClause) clauses.push(yearClause);
    }

    if (ownerFilter.size > 0) {
      const parts = [...ownerFilter].map(owner => `owneridname eq '${escapeODataLiteral(owner)}'`);
      clauses.push(`(${parts.join(' or ')})`);
    }

    const buildAdvNodeClause = (node: AdvFilterNode): string => {
      if (node.kind === 'row') {
        if (node.field === 'taskStatus' || node.field === 'enrolStatus' || node.field === 'year' || node.field === 'owner') {
          if (node.field === 'owner') {
            const owners = [...node.values].filter(Boolean);
            if (owners.length === 0) return '';
            const clause = `(${owners.map(o => `owneridname eq '${escapeODataLiteral(o)}'`).join(' or ')})`;
            return node.operator === 'equals' ? clause : `not ${clause}`;
          }

          if (node.field === 'year') {
            const years = [...node.values].filter(Boolean);
            if (years.length === 0) return '';
            const clause = buildProgramYearLookupClause(years);
            if (!clause) return '';
            return node.operator === 'equals' ? clause : `not ${clause}`;
          }

          const map = node.field === 'taskStatus' ? taskStatusCodeByLabel : enrolStatusCodeByLabel;
          const field = node.field === 'taskStatus' ? 'vsi_taskstatus' : 'vsi_enrolmentstatus';
          const codes = [...node.values]
            .map(v => map.get(v))
            .filter((code): code is number => Number.isFinite(code));
          if (codes.length === 0) return '';
          const clause = `(${codes.map(code => `${field} eq ${code}`).join(' or ')})`;
          return node.operator === 'equals' ? clause : `not ${clause}`;
        }

        if (node.field === 'hasPartners' || node.field === 'inCombinedFarm' || node.field === 'isNewParticipant') {
          const field = node.field === 'hasPartners'
            ? 'vsi_haspartners'
            : (node.field === 'inCombinedFarm' ? 'vsi_incombinedfarm' : 'vsi_isnewparticipant');
          const values = [...node.values];
          if (values.length === 0) return '';
          const boolClauses = values.map(v => {
            const yes = v.toLowerCase() === 'yes';
            return yes ? `${field} eq true` : `${field} ne true`;
          });
          const clause = `(${boolClauses.join(' or ')})`;
          return node.operator === 'equals' ? clause : `not ${clause}`;
        }

        const text = node.textValue?.trim() ?? '';
        if (!text) return '';
        const safe = escapeODataLiteral(text);
        const field = node.field === 'pin' ? 'vsi_name' : node.field === 'producer' ? 'vsi_participantidname' : 'vsi_enrolmentfee';
        if (node.field === 'fee') {
          const num = Number(text);
          if (!Number.isFinite(num)) return '';
          if (node.operator === 'equals') return `${field} eq ${num}`;
          if (node.operator === 'notEquals') return `${field} ne ${num}`;
          return '';
        }

        switch (node.operator) {
          case 'equals': return `${field} eq '${safe}'`;
          case 'notEquals': return `${field} ne '${safe}'`;
          case 'contains': return `contains(${field}, '${safe}')`;
          case 'notContains': return `not contains(${field}, '${safe}')`;
          case 'beginsWith': return `startswith(${field}, '${safe}')`;
          case 'endsWith': return `endswith(${field}, '${safe}')`;
          default: return '';
        }
      }

      const childClauses = node.children.map(buildAdvNodeClause).filter(Boolean);
      if (childClauses.length === 0) return '';
      const joiner = node.logic === 'AND' ? ' and ' : ' or ';
      return `(${childClauses.join(joiner)})`;
    };

    const advClauses = advFilterNodes.map(buildAdvNodeClause).filter(Boolean);
    if (advClauses.length > 0) {
      const joiner = advLogicOp === 'AND' ? ' and ' : ' or ';
      clauses.push(`(${advClauses.join(joiner)})`);
    }

    return clauses.join(' and ');
  }, [
    filters,
    taskStatusFilter,
    enrolStatusFilter,
    taskFilterOp,
    enrolFilterOp,
    yearFilter,
    ownerFilter,
    advFilterNodes,
    advLogicOp,
    taskStatusCodeByLabel,
    enrolStatusCodeByLabel,
    escapeODataLiteral,
    buildProgramYearLookupClause,
  ]);

  useEffect(() => {
    if (demoQueryMode !== 'server') return;
    void fetchEnrolments({ mode: 'server', page: currentPage, searchTerm: debouncedSearchQuery, yearsBack: demoYearsWindow, serverFilter: buildServerFilter, orderBy: serverOrderBy });
  }, [demoQueryMode, demoYearsWindow, currentPage, debouncedSearchQuery, fetchEnrolments, buildServerFilter, serverOrderBy]);

  const countEnrolmentsByFilter = useCallback(async (filter: string): Promise<number> => {
    const recentYearFilter = await getRecentProgramYearFilter();
    const combinedFilter = `(${recentYearFilter}) and (${filter})`;
    let count = 0;
    let skipToken: string | undefined;
    do {
      const result = await Vsi_participantprogramyearsService.getAll({
        select: ['vsi_participantprogramyearid'],
        filter: combinedFilter,
        maxPageSize: 5000,
        ...(skipToken ? { skipToken } : {}),
      });
      const rowsForBatch = result.data ?? [];
      count += rowsForBatch.length;
      const raw = result as unknown as Record<string, unknown>;
      skipToken = (raw['skipToken'] ?? raw['@odata.nextLink']) as string | undefined;
    } while (skipToken);
    return count;
  }, [getRecentProgramYearFilter]);

  const refreshInfoCounts = useCallback(async () => {
    try {
      const [newCount, pendingCount, remindersCount] = await Promise.all([
        countEnrolmentsByFilter('vsi_isnewparticipant eq true'),
        countEnrolmentsByFilter('vsi_taskstatus eq 865520001'),
        countEnrolmentsByFilter('(vsi_nonpenaltydeadlineremindersent ne true) or (vsi_finaldeadlineremindersent ne true)'),
      ]);
      setNewParticipantCount(newCount);
      setPendingSupervisorCount(pendingCount);
      setDeadlineReminderCount(remindersCount);
    } catch (e) {
      console.error('Failed to refresh dashboard info counts:', e);
    }
  }, [countEnrolmentsByFilter]);

  const refreshServerTotalResults = useCallback(async () => {
    const term = debouncedSearchQuery.trim();
    const recentYearFilter = await getRecentProgramYearFilter();
    const searchFilter = term ? `contains(vsi_name, '${escapeODataLiteral(term)}')` : '';
    const combinedFilter = [recentYearFilter, buildServerFilter.trim(), searchFilter]
      .filter(Boolean)
      .map(clause => `(${clause})`)
      .join(' and ');
    let count = 0;
    let skipToken: string | undefined;
    do {
      const result = await Vsi_participantprogramyearsService.getAll({
        select: ['vsi_participantprogramyearid'],
        filter: combinedFilter,
        maxPageSize: 5000,
        ...(skipToken ? { skipToken } : {}),
      });
      count += (result.data ?? []).length;
      const raw = result as unknown as Record<string, unknown>;
      skipToken = (raw['skipToken'] ?? raw['@odata.nextLink']) as string | undefined;
    } while (skipToken);
    setServerTotalResults(count);
  }, [debouncedSearchQuery, getRecentProgramYearFilter, escapeODataLiteral, buildServerFilter]);

  useEffect(() => {
    if (demoQueryMode === 'client') {
      setNewParticipantCount(rows.filter(r => r.vsi_isnewparticipant === true).length);
      setPendingSupervisorCount(rows.filter(r => r.vsi_taskstatus === 865520001).length);
      setDeadlineReminderCount(rows.filter(r => r.vsi_nonpenaltydeadlineremindersent !== true || r.vsi_finaldeadlineremindersent !== true).length);
      return;
    }
    void refreshInfoCounts();
  }, [demoQueryMode, rows, refreshInfoCounts]);

  useEffect(() => {
    if (demoQueryMode !== 'server') return;
    void refreshServerTotalResults();
  }, [demoQueryMode, demoYearsWindow, debouncedSearchQuery, buildServerFilter, refreshServerTotalResults]);

  const reloadFirstPage = useCallback(() => {
    clearEnrolmentCache();
    setCurrentPage(1);
    if (demoQueryMode === 'client') {
      void fetchEnrolments({ mode: 'client', yearsBack: demoYearsWindow });
    } else {
      void fetchEnrolments({ mode: 'server', page: 1, searchTerm: debouncedSearchQuery, yearsBack: demoYearsWindow, serverFilter: buildServerFilter, orderBy: serverOrderBy });
      void refreshInfoCounts();
    }
  }, [demoQueryMode, demoYearsWindow, debouncedSearchQuery, fetchEnrolments, refreshInfoCounts, buildServerFilter, serverOrderBy]);

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
    setToasts(prev => [...prev, { id: nextToastId(), message, type }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const setFiltersAndReset = useCallback((next: QuickFilterState) => {
    setFilters(next);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);
  const setTaskStatusFilterAndReset = useCallback((next: Set<string>) => {
    setTaskStatusFilter(next);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);
  const setEnrolStatusFilterAndReset = useCallback((next: Set<string>) => {
    setEnrolStatusFilter(next);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);
  const setYearFilterAndReset = useCallback((next: Set<string>) => {
    setYearFilter(next);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);
  const setOwnerFilterAndReset = useCallback((next: Set<string>) => {
    setOwnerFilter(next);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);
  const setTaskFilterOpAndReset = useCallback((next: FilterOperator) => {
    setTaskFilterOp(next);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);
  const setEnrolFilterOpAndReset = useCallback((next: FilterOperator) => {
    setEnrolFilterOp(next);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);
  const setAdvFilterNodesAndReset = useCallback((next: AdvFilterNode[]) => {
    setAdvFilterNodes(next);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);
  const setAdvLogicOpAndReset = useCallback((next: LogicOp) => {
    setAdvLogicOp(next);
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);

  // Build the combined node list shown in Edit Filters:
  // quick filters (except flagged) + column header filters + existing adv nodes.
  // Synthetic nodes use negative IDs to avoid collisions with nextFilterId().
  const effectiveFilterNodes = useMemo((): AdvFilterNode[] => {
    let sid = -1;
    const extra: AdvFilterNode[] = [];
    if (filters.verifiedCalc)
      extra.push({ kind: 'row', id: sid--, field: 'enrolStatus', operator: 'equals', values: new Set(['VerifiedENCalculalted']), textValue: '' });
    if (filters.unverifiedCalc)
      extra.push({ kind: 'row', id: sid--, field: 'enrolStatus', operator: 'equals', values: new Set(['UnverifiedENCalculated']), textValue: '' });
    if (filters.fortyFiveDayLetter)
      extra.push({ kind: 'row', id: sid--, field: 'enrolStatus', operator: 'equals', values: new Set(['_45DayLetter']), textValue: '' });
    if (filters.partnerships)
      extra.push({ kind: 'group', id: sid--, logic: 'OR', children: [
        { kind: 'row', id: sid--, field: 'hasPartners', operator: 'equals', values: new Set(['Yes']), textValue: '' },
        { kind: 'row', id: sid--, field: 'inCombinedFarm', operator: 'equals', values: new Set(['Yes']), textValue: '' },
      ]});
    if (taskStatusFilter.size > 0)
      extra.push({ kind: 'row', id: sid--, field: 'taskStatus', operator: taskFilterOp, values: new Set(taskStatusFilter), textValue: '' });
    if (enrolStatusFilter.size > 0)
      extra.push({ kind: 'row', id: sid--, field: 'enrolStatus', operator: enrolFilterOp, values: new Set(enrolStatusFilter), textValue: '' });
    if (yearFilter.size > 0)
      extra.push({ kind: 'row', id: sid--, field: 'year', operator: 'equals', values: new Set(yearFilter), textValue: '' });
    if (ownerFilter.size > 0)
      extra.push({ kind: 'row', id: sid--, field: 'owner', operator: 'equals', values: new Set(ownerFilter), textValue: '' });
    return [...extra, ...advFilterNodes];
  }, [filters, taskStatusFilter, enrolStatusFilter, yearFilter, ownerFilter, taskFilterOp, enrolFilterOp, advFilterNodes]);

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
    setYearFilter: setYearFilterAndReset,
    setOwnerFilter: setOwnerFilterAndReset,
  }), [
    setFiltersAndReset,
    setTaskStatusFilterAndReset,
    setEnrolStatusFilterAndReset,
    setTaskFilterOpAndReset,
    setEnrolFilterOpAndReset,
    setAdvFilterNodesAndReset,
    setAdvLogicOpAndReset,
    setYearFilterAndReset,
    setOwnerFilterAndReset,
  ]);

  const viewState = useMemo(() => ({
    visibleColumnKeys, columnWidths, sortKey, sortDir, filters,
    taskStatusFilter, enrolStatusFilter, taskFilterOp, enrolFilterOp,
    advFilterNodes, advLogicOp,
  }), [visibleColumnKeys, columnWidths, sortKey, sortDir, filters,
    taskStatusFilter, enrolStatusFilter, taskFilterOp, enrolFilterOp,
    advFilterNodes, advLogicOp]);

  const {
    savedViews, viewsLoading, activeViewId, hasUnsavedChanges, saveError,
    handleSelectView, handleSaveAsNew, handleSaveCurrentView,
    handleDeleteView, handleRenameView, handleResetDefault, reloadViews,
  } = useViews(viewState, viewSetters);

  // Close edit panels whenever a view is applied so they remount with fresh state
  const closePanels = useCallback(() => {
    setShowEditColumns(false);
    setShowEditFilters(false);
  }, []);

  // Persist filter/sort/pagination state so it survives navigating to details/calculation and back.
  useEffect(() => {
    dashboardFilterCache = {
      visibleColumnKeys, columnWidths, sortKey, sortDir,
      filters, searchQuery,
      taskStatusFilter, enrolStatusFilter, yearFilter, ownerFilter,
      taskFilterOp, enrolFilterOp, advFilterNodes, advLogicOp,
      currentPage,
    };
  }, [visibleColumnKeys, columnWidths, sortKey, sortDir, filters, searchQuery,
    taskStatusFilter, enrolStatusFilter, yearFilter, ownerFilter,
    taskFilterOp, enrolFilterOp, advFilterNodes, advLogicOp, currentPage]);

  // Refresh handler for manual reload
  const handleRefresh = useCallback(() => {
    reloadFirstPage();
    if (typeof fetchCoreAppId === 'function') fetchCoreAppId();
    reloadViews(false);
    setSortKey('modifiedOn');
    setSortDir('desc');
  }, [reloadFirstPage, fetchCoreAppId, reloadViews]);

  const handleSelectViewAndClose = useCallback((id: string | null) => {
    closePanels();
    handleSelectView(id);
  }, [closePanels, handleSelectView]);

  const handleResetDefaultAndClose = useCallback(() => {
    closePanels();
    handleResetDefault();
  }, [closePanels, handleResetDefault]);

  const handleDeleteViewAndClose = useCallback((id: string) => {
    closePanels();
    handleDeleteView(id);
  }, [closePanels, handleDeleteView]);

  const handleClearAllFilters = useCallback(() => {
    setSearchQuery('');
    setCurrentPage(1);
    setSelectedIds(new Set());
    handleResetDefaultAndClose();
  }, [handleResetDefaultAndClose]);

  // Stable id of the NPP system view — used to detect when NPP mode is active.
  const nppViewId = useMemo(
    () => savedViews.find(v => v.source === 'system' && /npp/i.test(v.name))?.id ?? null,
    [savedViews]
  );

  /** Clear every filter, then optionally apply a single task-status or enrol-status filter.
   * If the NPP view is currently active, reset to the default view first. */
  const applyWorklistFilter = useCallback((
    type: 'taskStatus' | 'enrolStatus',
    label: string,
  ) => {
    if (nppViewId && activeViewId === nppViewId) handleResetDefault();
    const is45Day = label === '_45DayLetter';
    setFilters({ verifiedCalc: false, unverifiedCalc: false, flagged: false, partnerships: false, fortyFiveDayLetter: is45Day, varianceAlert: false });
    setSearchQuery('');
    setTaskStatusFilter(type === 'taskStatus' ? new Set([label]) : new Set());
    setEnrolStatusFilter(type === 'enrolStatus' ? new Set([label]) : new Set());
    setYearFilter(new Set());
    setOwnerFilter(new Set());
    setAdvFilterNodes([]);
    setCurrentPage(1);
  }, [nppViewId, activeViewId, handleResetDefault]);

  // Sorting & filtering
  const { filteredRows, taskStatusOptions, enrolStatusOptions, yearOptions, ownerOptions } = useSortedAndFilteredRows(
    rows, sortKey, sortDir, filters,
    taskStatusFilter, enrolStatusFilter, yearFilter, ownerFilter, taskFilterOp, enrolFilterOp,
    advFilterNodes, advLogicOp, undefined,
  );

  const searchedRows = useMemo(() => {
    if (demoQueryMode === 'server') return rows;

    const term = searchQuery.trim().toLowerCase();
    if (!term) return filteredRows;

    return filteredRows.filter((row) => {
      const raw = row as unknown as Record<string, unknown>;
      const pin = row.vsi_name ?? '';
      const participant = (row.vsi_participantidname ?? raw['_vsi_participantid_value@OData.Community.Display.V1.FormattedValue'] ?? '') as string;
      const farmCorp = (row.new_combinedfarmname ?? row.vsi_partnershipnames ?? '') as string;

      return [pin, participant, farmCorp].some((value) => String(value).toLowerCase().includes(term));
    });
  }, [demoQueryMode, filteredRows, searchQuery]);

  const totalPages = demoQueryMode === 'client'
    ? Math.max(1, Math.ceil(searchedRows.length / pageSize))
    : Math.max(1, Math.ceil(serverTotalResults / pageSize));
  const pagedRows = demoQueryMode === 'client'
    ? searchedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : searchedRows;
  const pageStart = searchedRows.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1;
  const pageEnd = searchedRows.length === 0
    ? 0
    : (demoQueryMode === 'client' ? Math.min(currentPage * pageSize, searchedRows.length) : pageStart + searchedRows.length - 1);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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

  const rangeSelect = (ids: string[], checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => { if (checked) next.add(id); else next.delete(id); });
      return next;
    });
  };

  const toggleFilter = (key: keyof QuickFilterState) => {
    // When toggling the partnerships filter ON, switch to the matching system view.
    // When toggling it OFF, reset to the default view.
    if (key === 'partnerships') {
      const isCurrentlyOn = filters.partnerships;
      if (!isCurrentlyOn) {
        const partnerView = savedViews.find(
          v => v.source === 'system' && /partnership|combined/i.test(v.name)
        );
        if (partnerView) {
          // Capture current filter state before the view switch replaces it
          const prevFilters = filters;
          const prevTaskStatusFilter = taskStatusFilter;
          const prevEnrolStatusFilter = enrolStatusFilter;
          const prevTaskFilterOp = taskFilterOp;
          const prevEnrolFilterOp = enrolFilterOp;
          const prevAdvFilterNodes = advFilterNodes;
          const prevAdvLogicOp = advLogicOp;
          // Apply the view (columns, sort, widths), then restore existing filters + add partnerships
          handleSelectView(partnerView.id);
          setFilters({ ...prevFilters, partnerships: true });
          setTaskStatusFilter(prevTaskStatusFilter);
          setEnrolStatusFilter(prevEnrolStatusFilter);
          setTaskFilterOp(prevTaskFilterOp);
          setEnrolFilterOp(prevEnrolFilterOp);
          setAdvFilterNodes(prevAdvFilterNodes);
          setAdvLogicOp(prevAdvLogicOp);
          setCurrentPage(1);
          return;
        }
      } else {
        // Capture current filter state before the default view resets it
        const prevFilters = filters;
        const prevTaskStatusFilter = taskStatusFilter;
        const prevEnrolStatusFilter = enrolStatusFilter;
        const prevTaskFilterOp = taskFilterOp;
        const prevEnrolFilterOp = enrolFilterOp;
        const prevAdvFilterNodes = advFilterNodes;
        const prevAdvLogicOp = advLogicOp;
        // Restore default layout (columns, sort, widths), then reapply existing filters minus partnerships
        handleResetDefault();
        setFilters({ ...prevFilters, partnerships: false });
        setTaskStatusFilter(prevTaskStatusFilter);
        setEnrolStatusFilter(prevEnrolStatusFilter);
        setTaskFilterOp(prevTaskFilterOp);
        setEnrolFilterOp(prevEnrolFilterOp);
        setAdvFilterNodes(prevAdvFilterNodes);
        setAdvLogicOp(prevAdvLogicOp);
        setCurrentPage(1);
        return;
      }
    }
    // If the NPP view is active and a quick filter is toggled, reset to default view first.
    if (nppViewId && activeViewId === nppViewId) {
      handleResetDefault();
    }
    setFilters(current => ({ ...current, [key]: !current[key] }));
    setCurrentPage(1);
  };

  const setSort = (key: SortKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
    if (demoQueryMode === 'server') {
      setCurrentPage(1);
      setSelectedIds(new Set());
    }
  };

  const setColumnWidth = (key: SortKey) => (w: number | undefined) =>
    setColumnWidths(prev => {
      const next = { ...prev };
      if (w === undefined) delete next[key]; else next[key] = w;
      return next;
    });

  return (
    <>
    <div className="enrolment-wrapper">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <ViewsMenu
          views={savedViews}
          activeViewId={activeViewId}
          hasUnsavedChanges={hasUnsavedChanges}
          onSelectView={handleSelectViewAndClose}
          onSaveAsNew={handleSaveAsNew}
          onSaveCurrentView={handleSaveCurrentView}
          onResetDefault={handleResetDefaultAndClose}
          onDeleteView={handleDeleteViewAndClose}
          onRenameView={handleRenameView}
          viewsLoading={viewsLoading}
        />
      </div>
      {saveError && <p className="enrolment-error">{saveError}</p>}

      {loading && <p className="enrolment-loading">Loading…</p>}
      {error && <p className="enrolment-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="search-and-tools-row">
            <EnrollmentSearchBar
              value={searchQuery}
              onChange={(nextValue) => {
                setSearchQuery(nextValue);
                setCurrentPage(1);
                setSelectedIds(new Set());
              }}
            />
            <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
              <button type="button" className="sa-filter-btn" onClick={() => setShowEditColumns(true)}>
                <Columns2 size={14} /> Edit columns
              </button>
              <button type="button" className="sa-filter-btn" onClick={() => setShowEditFilters(true)}>
                <Filter size={14} /> Edit filters
              </button>
              <button type="button" className="sa-filter-btn" onClick={handleClearAllFilters}>
                <FilterX size={14} /> Clear all filters
              </button>
              <button type="button" className="sa-filter-btn" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={14} />{loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="worklist-box">
            <div className="worklist-item">
              <Info size={14} className="worklist-icon" />
              <button className="worklist-link" onClick={() => {
                const nppView = savedViews.find(v => v.source === 'system' && /npp/i.test(v.name));
                if (nppView) {
                  handleSelectView(nppView.id);
                  setCurrentPage(1);
                }
              }}>
                New Participants: <strong>{newParticipantCount}</strong>
              </button>
            </div>
            <div className="worklist-item">
              <Info size={14} className="worklist-icon" />
              {activeRole === 'Verifier' ? (
                <button className="worklist-link" onClick={() => applyWorklistFilter('taskStatus', 'Supervisor')}>
                  Pending supervisor&rsquo;s approval: <strong>{pendingSupervisorCount}</strong>
                </button>
              ) : (
                <Link
                  to="/supervisor-approval"
                  className="worklist-link"
                  onClick={() => clearSaCache()}
                >
                  Pending supervisor&rsquo;s approval: <strong>{pendingSupervisorCount}</strong>
                </Link>
              )}
            </div>
            <div className="worklist-item">
              <Info size={14} className="worklist-icon" />
              <Link to="/deadline-reminders" className="worklist-link">
                Deadline reminders: <strong>{deadlineReminderCount}</strong>
              </Link>
            </div>
          </div>

          <div className="sa-card">
            <div className="sa-card-header">
              <EnrolmentQuickFilters
                filters={filters}
                onToggleFilter={toggleFilter}
                activeAdvancedCount={countActiveNodes(advFilterNodes)}
              />
              <EnrolmentActionsBar
                hasSelection={selectedIds.size > 0}
                selectedCount={selectedIds.size}
                onOpenBulkNotices={() => setShowBulkModal(true)}
                onOpenBulkEdit={() => setShowBulkEditModal(true)}
                onOpenAssign={() => setShowAssignModal(true)}
                onOpenReferToSupervisor={() => setShowSupervisorModal(true)}
                onOpenApproveCalculatedFees={() => setShowApproveFeesModal(true)}
              />
            </div>

          <EnrolmentDataTable
            allRowsCount={searchedRows.length}
            pagedRows={pagedRows}
            visibleColumnKeys={visibleColumnKeys}
            allPageSelected={allPageSelected}
            somePageSelected={somePageSelected}
            onToggleSelectAll={toggleSelectAll}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onRangeSelect={rangeSelect}
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
            yearOptions={yearOptions}
            yearFilter={yearFilter}
            onYearFilterChange={setYearFilterAndReset}
            ownerOptions={ownerOptions}
            ownerFilter={ownerFilter}
            onOwnerFilterChange={setOwnerFilterAndReset}
            ownerFilterShortcuts={currentUserDisplayName ? [{ label: 'Assigned to me', values: new Set([currentUserDisplayName]) }] : undefined}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={setSort}
            columnWidths={columnWidths}
            onColumnWidthChange={setColumnWidth}
            avatarUrls={avatarUrls}
            coreAppId={coreAppId}
            coreBaseUrl={coreBaseUrl}
          />

          <div className="dash-pagination">
            <span>
              {demoQueryMode === 'client'
                ? (searchedRows.length === 0
                  ? 'Showing 0 of 0 results'
                  : `Showing ${Math.min((currentPage - 1) * pageSize + 1, searchedRows.length)}-${Math.min(currentPage * pageSize, searchedRows.length)} of ${searchedRows.length} result${searchedRows.length !== 1 ? 's' : ''}`)
                : (searchedRows.length === 0
                  ? `Showing 0 results on page ${currentPage}`
                  : `Showing ${pageStart}-${pageEnd} on page ${currentPage}`)}
            </span>
            <div className="dash-pagination-controls">
              <button
                type="button"
                className="dash-page-btn"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || loading}
              >
                &lsaquo; Previous
              </button>
              {(() => {
                const pages: (number | '...')[] = [];
                if (totalPages <= 5) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  pages.push(1);
                  let start = Math.max(2, currentPage - 1);
                  let end = Math.min(totalPages - 1, currentPage + 1);
                  if (end - start < 2) {
                    if (start === 2) end = Math.min(totalPages - 1, start + 2);
                    else start = Math.max(2, end - 2);
                  }
                  if (start > 2) pages.push('...');
                  for (let i = start; i <= end; i++) pages.push(i);
                  if (end < totalPages - 1) pages.push('...');
                  pages.push(totalPages);
                }
                return pages.map((p, idx) =>
                  p === '...'
                    ? <span key={`dots-${idx}`} className="dash-page-dots">&hellip;</span>
                    : <button
                        key={p}
                        type="button"
                        className={`dash-page-btn${p === currentPage ? ' active' : ''}`}
                        onClick={() => setCurrentPage(p)}
                      >{p}</button>
                );
              })()}
              <button
                type="button"
                className="dash-page-btn"
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage === totalPages || loading}
              >
                Next &rsaquo;
              </button>
            </div>
          </div>
          </div>{/* /sa-card */}

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
                  };
                }));
                setSelectedIds(new Set());
                addToast(`${updates.length} enrolment${updates.length === 1 ? '' : 's'} approved successfully.`);
                clearSaCache();
                reloadFirstPage();
              }}
              onError={(msg) => addToast(msg, 'error')}
            />
          )}
        </>
      )}

      {showEditColumns && (
        <EditColumnsPanel
          key={activeViewId ?? 'default'}
          visibleKeys={visibleColumnKeys}
          onApply={(keys) => { setVisibleColumnKeys(keys); setShowEditColumns(false); }}
          onCancel={() => setShowEditColumns(false)}
        />
      )}
      {showEditFilters && (
        <EditFiltersPanel
          key={activeViewId ?? 'default'}
          filterNodes={effectiveFilterNodes}
          logicOp={advLogicOp}
          choiceOptionsByField={{ year: yearOptions, owner: ownerOptions }}
          onApply={(nodes, logic) => {
            setAdvFilterNodesAndReset(nodes);
            setAdvLogicOpAndReset(logic);
            // Consolidate: clear any quick filters + column filters that were merged in
            setFilters(f => ({ ...f, verifiedCalc: false, unverifiedCalc: false, fortyFiveDayLetter: false, partnerships: false }));
            setTaskStatusFilter(new Set());
            setEnrolStatusFilter(new Set());
            setYearFilter(new Set());
            setOwnerFilter(new Set());
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
          onSuccess={(message) => {
            setSelectedIds(new Set());
            addToast(message);
          }}
        />
      )}
      {showBulkEditModal && (
        <BulkEditEnrolmentsModal
          selectedIds={selectedIds}
          rows={rows}
          onClose={() => setShowBulkEditModal(false)}
          onComplete={(update) => {
            setRows(prev => prev.map(r => {
              if (!update.ids.includes(r.vsi_participantprogramyearid)) return r;
              return {
                ...r,
                ...(update.taskStatus != null ? { vsi_taskstatus: update.taskStatus as unknown as typeof r.vsi_taskstatus } : {}),
                ...(update.enrolmentStatus != null ? { vsi_enrolmentstatus: update.enrolmentStatus as unknown as typeof r.vsi_enrolmentstatus } : {}),
                ...(update.finalDeadlineDate != null ? { vsi_enrolmentfeesfinaldeadlinedate: update.finalDeadlineDate } : {}),
                ...(update.lateFinalDeadlineDate != null ? { vsi_lateenrolmentfeesfinaldeadlinedate: update.lateFinalDeadlineDate } : {}),
              };
            }));
            setSelectedIds(new Set());
            clearSaCache();
            reloadFirstPage();
            addToast(`${update.ids.length} enrolment${update.ids.length === 1 ? '' : 's'} updated successfully.`);
          }}
          onError={(msg) => addToast(msg, 'error')}
        />
      )}
      {showAssignModal && (
        <AssignOwnerModal
          selectedIds={selectedIds}
          rows={rows}
          onClose={() => setShowAssignModal(false)}
          onComplete={(assignedIds, ownerName) => {
            setRows(prev => prev.map(r =>
              assignedIds.includes(r.vsi_participantprogramyearid!)
                ? { ...r, owneridname: ownerName }
                : r
            ));
            setShowAssignModal(false);
            setSelectedIds(new Set());
            addToast(`${assignedIds.length} enrolment${assignedIds.length === 1 ? '' : 's'} assigned to ${ownerName}.`);
          }}
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
            clearSaCache();
            reloadFirstPage();
            addToast(`${updatedIds.length} enrolment${updatedIds.length === 1 ? '' : 's'} referred to supervisor.`);
          }}
          onError={(msg) => addToast(msg, 'error')}
        />
      )}
    </div>
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}