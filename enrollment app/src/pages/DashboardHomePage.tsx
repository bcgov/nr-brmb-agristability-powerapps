import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Columns2, Filter, FilterX, Info, RefreshCw } from 'lucide-react';

import type { SortKey, SortDir, FilterOperator, AdvFilterNode, LogicOp, QuickFilterState, AdvFilterField } from '../types/enrollment';
import { DEFAULT_VISIBLE_KEYS } from '../constants/columns';
import { getEnrolmentEnFeeVarianceThreshold } from '../constants/varianceThreshold';
import { buildEnrolmentOrderBy, normalizeEnrolmentSearchTerm } from '../data/enrolmentPaging';
import {
  countDeadlineReminders,
  countNewParticipants,
  countSupervisorApprovalQueue,
  countVerifierSupervisorTasks,
} from '../data/worklistCounts';
import { countActiveNodes, nextFilterId } from '../utils/filterTree';
import { useEnrolmentData, useSortedAndFilteredRows, clearEnrolmentCache, hasEnrolmentCache, patchEnrolmentCache, buildParticipantSearchClause } from '../hooks/useEnrolmentData';
import { useRole } from '../context/RoleContext';
import { resolveCurrentSystemUser } from '../utils/currentUser';
import { clearSaCache } from './SupervisorApprovalPage';
import { useViews } from '../hooks/useViews';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { Vsi_programyearsService } from '../generated/services/Vsi_programyearsService';
import {
  Vsi_participantprogramyearsvsi_enrolmentstatus,
  Vsi_participantprogramyearsvsi_taskstatus,
  Vsi_participantprogramyearsvsi_enrollmentregionaloffice,
  Vsi_participantprogramyearsvsi_farmingsector,
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

type NumberColumnFilter = {
  operator: 'equals' | 'notEquals' | 'hasValue' | 'hasNoValue' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual';
  value: string;
};

const NUMBER_COLUMN_FIELD_BY_KEY: Partial<Record<SortKey, AdvFilterField>> = {
  fee: 'fee',
  totalFeesOwedCalculated: 'totalFeesOwedCalculated',
  totalFeesPaid: 'totalFeesPaid',
  enrolmentFee: 'fee',
  latePay: 'latePay',
  nonPenaltyDeadlineDaysLeft: 'nonPenaltyDeadlineDaysLeft',
  finalDeadlineDaysDiff: 'finalDeadlineDaysDiff',
  lateFinalDeadlineDaysDiff: 'lateFinalDeadlineDaysDiff',
};

const NUMBER_COLUMN_KEY_BY_FIELD: Partial<Record<AdvFilterField, SortKey>> = {
  fee: 'fee',
  totalFeesOwedCalculated: 'totalFeesOwedCalculated',
  totalFeesPaid: 'totalFeesPaid',
  latePay: 'latePay',
  nonPenaltyDeadlineDaysLeft: 'nonPenaltyDeadlineDaysLeft',
  finalDeadlineDaysDiff: 'finalDeadlineDaysDiff',
  lateFinalDeadlineDaysDiff: 'lateFinalDeadlineDaysDiff',
};

const BOOLEAN_COLUMN_FIELD_BY_KEY: Partial<Record<SortKey, AdvFilterField>> = {
  flagged: 'flagged',
  hasPartners: 'hasPartners',
  inCombinedFarm: 'inCombinedFarm',
  isNewParticipant: 'isNewParticipant',
  lateParticipant: 'fullyProvinciallyFunded',
  bringForward: 'bringForward',
  broughtForward: 'broughtForward',
  manualReview: 'manualReview',
};

const BOOLEAN_COLUMN_KEY_BY_FIELD: Partial<Record<AdvFilterField, SortKey>> = {
  flagged: 'flagged',
  hasPartners: 'hasPartners',
  inCombinedFarm: 'inCombinedFarm',
  isNewParticipant: 'isNewParticipant',
  fullyProvinciallyFunded: 'lateParticipant',
  bringForward: 'bringForward',
  broughtForward: 'broughtForward',
  manualReview: 'manualReview',
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
type WorklistCount = number | null | undefined;

function formatWorklistCount(value: WorklistCount): string {
  if (value === null) return '?';
  if (value === undefined) return '?';
  return value.toLocaleString();
}


export function DashboardHomePage() {
  const { activeRole, demoYearsWindow } = useRole();
  const { rows, setRows, loading, hasNextPage, pageSize, error, avatarUrls, fetchEnrolments, coreAppId, coreBaseUrl, fetchCoreAppId } = useEnrolmentData();

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
  const [programYearIdsByLabel, setProgramYearIdsByLabel] = useState<Record<string, string[]>>({});
  const [worklistCounts, setWorklistCounts] = useState<{
    newParticipants: WorklistCount;
    supervisorApproval: WorklistCount;
    deadlineReminders: WorklistCount;
  }>({ newParticipants: null, supervisorApproval: null, deadlineReminders: null });
  const [worklistCountRefreshCounter, setWorklistCountRefreshCounter] = useState(0);

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(() => dashboardFilterCache?.searchQuery ?? '');
  const latestChangeStampRef = useRef<string | null>(null);
  const lastServerQueryKeyRef = useRef<string | null>(null);

  const taskStatusCodeByLabel = useMemo(() => {
    const entries = Object.entries(Vsi_participantprogramyearsvsi_taskstatus).map(([code, label]) => [label, Number(code)] as const);
    return new Map<string, number>(entries);
  }, []);

  const enrolStatusCodeByLabel = useMemo(() => {
    const entries = Object.entries(Vsi_participantprogramyearsvsi_enrolmentstatus).map(([code, label]) => [label, Number(code)] as const);
    return new Map<string, number>(entries);
  }, []);

  const regionalOfficeCodeByLabel = useMemo(() => {
    const entries = Object.entries(Vsi_participantprogramyearsvsi_enrollmentregionaloffice).map(([code, label]) => [label, Number(code)] as const);
    return new Map<string, number>(entries);
  }, []);

  const farmingSectorCodeByLabel = useMemo(() => {
    const entries = Object.entries(Vsi_participantprogramyearsvsi_farmingsector).map(([code, label]) => [label, Number(code)] as const);
    return new Map<string, number>(entries);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(normalizeEnrolmentSearchTerm(searchQuery));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

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
      const recentFilterPromise = getRecentProgramYearFilter();
      const results = await Promise.allSettled([
        recentFilterPromise.then(countNewParticipants),
        activeRole === 'Verifier'
          ? recentFilterPromise.then(countVerifierSupervisorTasks)
          : countSupervisorApprovalQueue(),
        countDeadlineReminders(),
      ]);

      if (cancelled) return;
      const getValue = (result: PromiseSettledResult<number>): WorklistCount =>
        result.status === 'fulfilled' ? result.value : undefined;
      setWorklistCounts({
        newParticipants: getValue(results[0]),
        supervisorApproval: getValue(results[1]),
        deadlineReminders: getValue(results[2]),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [activeRole, getRecentProgramYearFilter, worklistCountRefreshCounter]);

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

  const serverOrderBy = useMemo(
    () => buildEnrolmentOrderBy(sortKey, sortDir),
    [sortKey, sortDir],
  );
  const varianceThreshold = getEnrolmentEnFeeVarianceThreshold() / 100;

  const buildServerFilter = useMemo(() => {
    const clauses: string[] = [];

    if (filters.verifiedCalc) clauses.push('vsi_enrolmentstatus eq 865520006');
    if (filters.unverifiedCalc) clauses.push('vsi_enrolmentstatus eq 865520005');
    if (filters.fortyFiveDayLetter) clauses.push('vsi_enrolmentstatus eq 865520010');
    if (filters.partnerships) clauses.push('(vsi_haspartners eq true or vsi_incombinedfarm eq true)');
    if (filters.flagged) {
      clauses.push(`((vsi_prevyearpartnotverified eq true and vsi_isnewparticipant ne true) or (vsi_isnewparticipant ne true and vsi_enrolmentfee ne null and vsi_previousyearcalculatedenfee eq null) or (vsi_variancecalculation ge ${varianceThreshold} or vsi_variancecalculation le -${varianceThreshold}))`);
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
        // has-value / has-no-value operators apply to any field
        if (node.operator === 'hasValue' || node.operator === 'hasNoValue') {
          const fieldMap: Partial<Record<string, string>> = {
            enrolmentNoticeSentDate: 'vsi_enrolmentnoticesentdate',
            totalFeesOwed: 'vsi_totalfeesowed',
            fullyProvinciallyFunded: 'vsi_fullyprovinciallyfunded',
            pin: 'vsi_name', fee: 'vsi_totalfeesowedcalculated',
            hasPartners: 'vsi_haspartners', inCombinedFarm: 'vsi_incombinedfarm',
            isNewParticipant: 'vsi_isnewparticipant',
            totalFeesOwedCalculated: 'vsi_totalfeesowedcalculated',
            totalFeesPaid: 'vsi_totalfeespaid',
            latePay: 'vsi_latepaymentfee',
            nonPenaltyDeadlineDaysLeft: 'vsi_nonpenaltydeadlinedaysleft',
            finalDeadlineDaysDiff: 'vsi_finaldeadlinedaysdiff',
            lateFinalDeadlineDaysDiff: 'vsi_latefinaldeadlinedaysdiff',
          };
          const col = fieldMap[node.field];
          if (!col) return '';
          return node.operator === 'hasValue' ? `${col} ne null` : `${col} eq null`;
        }

        if (node.field === 'taskStatus' || node.field === 'enrolStatus' || node.field === 'year' || node.field === 'owner' || node.field === 'regionalOffice' || node.field === 'farmingSector') {
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

          const map = node.field === 'taskStatus' ? taskStatusCodeByLabel
            : node.field === 'enrolStatus' ? enrolStatusCodeByLabel
            : node.field === 'regionalOffice' ? regionalOfficeCodeByLabel
            : farmingSectorCodeByLabel;
          const field = node.field === 'taskStatus' ? 'vsi_taskstatus'
            : node.field === 'enrolStatus' ? 'vsi_enrolmentstatus'
            : node.field === 'regionalOffice' ? 'vsi_enrollmentregionaloffice'
            : 'vsi_farmingsector';
          const codes = [...node.values]
            .map(v => map.get(v))
            .filter((code): code is number => Number.isFinite(code));
          if (codes.length === 0) return '';
          const clause = `(${codes.map(code => `${field} eq ${code}`).join(' or ')})`;
          return node.operator === 'equals' ? clause : `not ${clause}`;
        }

        if (node.field === 'hasPartners' || node.field === 'inCombinedFarm' || node.field === 'isNewParticipant' || node.field === 'fullyProvinciallyFunded' || node.field === 'bringForward' || node.field === 'broughtForward' || node.field === 'manualReview') {
          const fieldMap: Record<string, string> = {
            hasPartners: 'vsi_haspartners',
            inCombinedFarm: 'vsi_incombinedfarm',
            isNewParticipant: 'vsi_isnewparticipant',
            fullyProvinciallyFunded: 'vsi_fullyprovinciallyfunded',
            bringForward: 'vsi_bringforward',
            broughtForward: 'vsi_broughtforward',
            manualReview: 'vsi_manualreview',
          };
          const field = fieldMap[node.field];
          const values = [...node.values];
          if (values.length === 0) return '';
          const boolClauses = values.map(v => {
            const yes = v.toLowerCase() === 'yes';
            return yes ? `${field} eq true` : `${field} ne true`;
          });
          const clause = `(${boolClauses.join(' or ')})`;
          return node.operator === 'equals' ? clause : `not ${clause}`;
        }

        if (node.field === 'flagged') {
          const values = [...node.values];
          if (values.length === 0) return '';
          const flaggedExpr = `((vsi_prevyearpartnotverified eq true and vsi_isnewparticipant ne true) or (vsi_isnewparticipant ne true and vsi_enrolmentfee ne null and vsi_previousyearcalculatedenfee eq null) or (vsi_variancecalculation ge ${varianceThreshold} or vsi_variancecalculation le -${varianceThreshold}))`;
          const clauses = values.map(v => (v.toLowerCase() === 'yes' ? flaggedExpr : `not ${flaggedExpr}`));
          const clause = clauses.length === 1 ? clauses[0] : `(${clauses.join(' or ')})`;
          return node.operator === 'equals' ? clause : `not (${clause})`;
        }

        if (node.field === 'fee' || node.field === 'totalFeesOwed' || node.field === 'totalFeesOwedCalculated' || node.field === 'totalFeesPaid' || node.field === 'latePay' || node.field === 'nonPenaltyDeadlineDaysLeft' || node.field === 'finalDeadlineDaysDiff' || node.field === 'lateFinalDeadlineDaysDiff') {
          const numericFields: Partial<Record<string, string>> = {
            fee: 'vsi_totalfeesowedcalculated',
            totalFeesOwed: 'vsi_totalfeesowedcalculated',
            totalFeesOwedCalculated: 'vsi_totalfeesowedcalculated',
            totalFeesPaid: 'vsi_totalfeespaid',
            latePay: 'vsi_latepaymentfee',
            nonPenaltyDeadlineDaysLeft: 'vsi_nonpenaltydeadlinedaysleft',
            finalDeadlineDaysDiff: 'vsi_finaldeadlinedaysdiff',
            lateFinalDeadlineDaysDiff: 'vsi_latefinaldeadlinedaysdiff',
          };
          const field = numericFields[node.field];
          if (!field) return '';
          const num = Number(node.textValue);
          if (!Number.isFinite(num)) return '';
          switch (node.operator) {
            case 'equals': return `${field} eq ${num}`;
            case 'notEquals': return `${field} ne ${num}`;
            case 'greaterThan': return `${field} gt ${num}`;
            case 'greaterThanOrEqual': return `${field} ge ${num}`;
            case 'lessThan': return `${field} lt ${num}`;
            case 'lessThanOrEqual': return `${field} le ${num}`;
            default: return '';
          }
        }

        const text = node.textValue?.trim() ?? '';
        if (!text) return '';
        const safe = escapeODataLiteral(text);
        const numericFields: Partial<Record<string, string>> = {
          fee: 'vsi_totalfeesowedcalculated',
          totalFeesOwed: 'vsi_totalfeesowedcalculated', // legacy alias
          totalFeesOwedCalculated: 'vsi_totalfeesowedcalculated',
          totalFeesPaid: 'vsi_totalfeespaid', latePay: 'vsi_latepaymentfee',
        };
        const textFieldMap: Partial<Record<string, string>> = {
          pin: 'vsi_name', producer: 'vsi_participantidname',
          modifiedOn: 'modifiedon',
          enrolmentNoticeSentDate: 'vsi_enrolmentnoticesentdate',
          enrolmentOptedOutDate: 'vsi_programyearoptoutdate',
          fileReceivedDate: 'vsi_filereceiveddate',
          feesPaidDate: 'vsi_enrolmentfeespaiddate',
        };
        if (numericFields[node.field]) {
          const field = numericFields[node.field]!;
          const num = Number(text);
          if (!Number.isFinite(num)) return '';
          if (node.operator === 'equals') return `${field} eq ${num}`;
          if (node.operator === 'notEquals') return `${field} ne ${num}`;
          return '';
        }
        const field = textFieldMap[node.field] ?? 'vsi_enrolmentfee';
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
    regionalOfficeCodeByLabel,
    farmingSectorCodeByLabel,
    escapeODataLiteral,
    buildProgramYearLookupClause,
    varianceThreshold,
  ]);

  const getLatestEnrolmentChangeStamp = useCallback(async (): Promise<string | null> => {
    const filters: string[] = [await getRecentProgramYearFilter()];

    if (buildServerFilter.trim()) {
      filters.push(`(${buildServerFilter.trim()})`);
    }

    if (debouncedSearchQuery.trim()) {
      filters.push(await buildParticipantSearchClause(debouncedSearchQuery.trim()));
    }

    const result = await Vsi_participantprogramyearsService.getAll({
      select: ['modifiedon'],
      orderBy: ['modifiedon desc'],
      filter: filters.map(clause => `(${clause})`).join(' and '),
      maxPageSize: 1,
    });

    return result.data?.[0]?.modifiedon ?? null;
  }, [buildServerFilter, debouncedSearchQuery, getRecentProgramYearFilter]);

  const loadDashboardRows = fetchEnrolments;

  useEffect(() => {
    const queryKey = [currentPage, debouncedSearchQuery, buildServerFilter, serverOrderBy.join('|'), demoYearsWindow].join('\x00');
    if (hasEnrolmentCache() && lastServerQueryKeyRef.current === queryKey) return;
    lastServerQueryKeyRef.current = queryKey;
    if (hasEnrolmentCache()) clearEnrolmentCache();
    setRows([]);
    void loadDashboardRows({
      page: currentPage,
      searchTerm: debouncedSearchQuery,
      yearsBack: demoYearsWindow,
      serverFilter: buildServerFilter,
      orderBy: serverOrderBy,
    });
  }, [demoYearsWindow, currentPage, debouncedSearchQuery, loadDashboardRows, buildServerFilter, serverOrderBy, setRows]);

  const reloadFirstPage = useCallback(() => {
    clearEnrolmentCache();
    lastServerQueryKeyRef.current = null;
    if (currentPage !== 1) {
      setCurrentPage(1);
      return;
    }
    setCurrentPage(1);
    void loadDashboardRows({
      page: 1,
      searchTerm: debouncedSearchQuery,
      yearsBack: demoYearsWindow,
      serverFilter: buildServerFilter,
      orderBy: serverOrderBy,
    });
  }, [currentPage, demoYearsWindow, debouncedSearchQuery, loadDashboardRows, buildServerFilter, serverOrderBy]);

  const refreshCurrentPageIfChanged = useCallback(async () => {
    try {
      const latestStamp = await getLatestEnrolmentChangeStamp();
      if (latestChangeStampRef.current == null) {
        latestChangeStampRef.current = latestStamp;
        return;
      }
      if (latestStamp === latestChangeStampRef.current) return;

      latestChangeStampRef.current = latestStamp;
      clearEnrolmentCache();
      lastServerQueryKeyRef.current = null;
      await loadDashboardRows({
        page: currentPage,
        searchTerm: debouncedSearchQuery,
        yearsBack: demoYearsWindow,
        serverFilter: buildServerFilter,
        orderBy: serverOrderBy,
      });
    } catch (e) {
      console.error('Failed to probe enrolment changes on dashboard return:', e);
    }
  }, [buildServerFilter, currentPage, debouncedSearchQuery, demoYearsWindow, getLatestEnrolmentChangeStamp, loadDashboardRows, serverOrderBy]);

  useEffect(() => {
    const handleFocus = () => {
      void refreshCurrentPageIfChanged();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshCurrentPageIfChanged();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshCurrentPageIfChanged]);

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
  const setNumberColumnFilterAndReset = useCallback((key: SortKey, next: NumberColumnFilter | null) => {
    const field = NUMBER_COLUMN_FIELD_BY_KEY[key];
    if (!field) return;
    setAdvFilterNodes(prev => {
      const remaining = prev.filter(node => !(node.kind === 'row' && node.field === field));
      if (!next) return remaining;
      return [...remaining, {
        kind: 'row' as const,
        id: nextFilterId(),
        field,
        operator: next.operator,
        values: new Set<string>(),
        textValue: next.value,
      }];
    });
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);

  const setBooleanColumnFilterAndReset = useCallback((key: SortKey, nextValues: Set<string>) => {
    const field = BOOLEAN_COLUMN_FIELD_BY_KEY[key];
    if (!field) return;
    setAdvFilterNodes(prev => {
      const remaining = prev.filter(node => !(node.kind === 'row' && node.field === field));
      if (nextValues.size === 0) return remaining;
      return [...remaining, {
        kind: 'row' as const,
        id: nextFilterId(),
        field,
        operator: 'equals',
        values: new Set(nextValues),
        textValue: '',
      }];
    });
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);

  const setBooleanColumnFilterOperatorAndReset = useCallback((key: SortKey, nextOperator: FilterOperator) => {
    const field = BOOLEAN_COLUMN_FIELD_BY_KEY[key];
    if (!field) return;
    setAdvFilterNodes(prev => {
      const target = prev.find(node => node.kind === 'row' && node.field === field);
      const nextValues = target?.kind === 'row' ? new Set(target.values) : new Set<string>();
      const remaining = prev.filter(node => !(node.kind === 'row' && node.field === field));
      if (nextValues.size === 0) return remaining;
      return [...remaining, {
        kind: 'row' as const,
        id: nextFilterId(),
        field,
        operator: nextOperator,
        values: nextValues,
        textValue: '',
      }];
    });
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, []);

  const numberColumnFilters = useMemo(() => {
    const result: Partial<Record<SortKey, NumberColumnFilter>> = {};
    const visit = (nodes: AdvFilterNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'group') {
          visit(node.children);
          continue;
        }
        const key = NUMBER_COLUMN_KEY_BY_FIELD[node.field];
        if (!key) continue;
        result[key] = { operator: node.operator as NumberColumnFilter['operator'], value: node.textValue ?? '' };
      }
    };
    visit(advFilterNodes);
    return result;
  }, [advFilterNodes]);

  const booleanColumnFilters = useMemo(() => {
    const result: Partial<Record<SortKey, { values: Set<string>; operator: FilterOperator }>> = {};
    const visit = (nodes: AdvFilterNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'group') {
          visit(node.children);
          continue;
        }
        const key = BOOLEAN_COLUMN_KEY_BY_FIELD[node.field];
        if (!key) continue;
        result[key] = {
          values: new Set(node.values),
          operator: node.operator === 'notEquals' ? 'notEquals' : 'equals',
        };
      }
    };
    visit(advFilterNodes);
    return result;
  }, [advFilterNodes]);

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
    taskStatusFilter, enrolStatusFilter, yearFilter, ownerFilter,
    taskFilterOp, enrolFilterOp,
    advFilterNodes, advLogicOp,
  }), [visibleColumnKeys, columnWidths, sortKey, sortDir, filters,
    taskStatusFilter, enrolStatusFilter, yearFilter, ownerFilter,
    taskFilterOp, enrolFilterOp,
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
    setWorklistCountRefreshCounter(value => value + 1);
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

  const { taskStatusOptions, enrolStatusOptions, yearOptions: pageYearOptions, ownerOptions } = useSortedAndFilteredRows(
    rows, sortKey, sortDir, filters,
    taskStatusFilter, enrolStatusFilter, yearFilter, ownerFilter, taskFilterOp, enrolFilterOp,
    advFilterNodes, advLogicOp, undefined,
  );
  const yearOptions = useMemo(() => {
    const configuredYears = Object.keys(programYearIdsByLabel).sort();
    return configuredYears.length > 0 ? configuredYears : pageYearOptions;
  }, [programYearIdsByLabel, pageYearOptions]);

  const searchedRows = rows;
  const pagedRows = rows;
  const pageStart = rows.length === 0 ? 0 : ((currentPage - 1) * pageSize) + 1;
  const pageEnd = rows.length === 0 ? 0 : pageStart + rows.length - 1;

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
    // If the NPP view is active and a quick filter is toggled, reset to default view layout first
    // but preserve any column-header filters the user has applied.
    if (nppViewId && activeViewId === nppViewId) {
      const prevTaskStatusFilter = taskStatusFilter;
      const prevEnrolStatusFilter = enrolStatusFilter;
      const prevTaskFilterOp = taskFilterOp;
      const prevEnrolFilterOp = enrolFilterOp;
      const prevAdvFilterNodes = advFilterNodes;
      const prevAdvLogicOp = advLogicOp;
      const prevYearFilter = yearFilter;
      const prevOwnerFilter = ownerFilter;
      handleResetDefault();
      setTaskStatusFilter(prevTaskStatusFilter);
      setEnrolStatusFilter(prevEnrolStatusFilter);
      setTaskFilterOp(prevTaskFilterOp);
      setEnrolFilterOp(prevEnrolFilterOp);
      setAdvFilterNodes(prevAdvFilterNodes);
      setAdvLogicOp(prevAdvLogicOp);
      setYearFilter(prevYearFilter);
      setOwnerFilter(prevOwnerFilter);
    }
    setFilters(current => ({ ...current, [key]: !current[key] }));
    setCurrentPage(1);
  };

  const setSort = (key: SortKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
    setCurrentPage(1);
    setSelectedIds(new Set());
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

      {loading && rows.length === 0 && <p className="enrolment-loading">Loading…</p>}
      {error && <p className="enrolment-error">{error}</p>}

      {(!loading || rows.length > 0) && !error && (
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
                New Participants ({formatWorklistCount(worklistCounts.newParticipants)})
              </button>
            </div>
            <div className="worklist-item">
              <Info size={14} className="worklist-icon" />
              {activeRole === 'Verifier' ? (
                <button className="worklist-link" onClick={() => applyWorklistFilter('taskStatus', 'Supervisor')}>
                  Pending supervisor&rsquo;s approval ({formatWorklistCount(worklistCounts.supervisorApproval)})
                </button>
              ) : (
                <Link
                  to="/supervisor-approval"
                  className="worklist-link"
                  onClick={() => clearSaCache()}
                >
                  Pending supervisor&rsquo;s approval ({formatWorklistCount(worklistCounts.supervisorApproval)})
                </Link>
              )}
            </div>
            <div className="worklist-item">
              <Info size={14} className="worklist-icon" />
              <Link to="/deadline-reminders" className="worklist-link">
                Deadline reminders ({formatWorklistCount(worklistCounts.deadlineReminders)})
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
            numberColumnFilters={numberColumnFilters}
            onNumberColumnFilterChange={setNumberColumnFilterAndReset}
            booleanColumnFilters={booleanColumnFilters}
            onBooleanColumnFilterChange={setBooleanColumnFilterAndReset}
            onBooleanColumnFilterOperatorChange={setBooleanColumnFilterOperatorAndReset}
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
              {searchedRows.length === 0
                ? `Showing 0 results on page ${currentPage}`
                : `Showing ${pageStart}-${pageEnd} on page ${currentPage}`}
              {hasNextPage ? ' (more records available)' : ''}
            </span>
            <div className="dash-pagination-controls">
              <button
                type="button"
                className="dash-page-btn"
                onClick={() => {
                  setSelectedIds(new Set());
                  setCurrentPage(p => Math.max(1, p - 1));
                }}
                disabled={currentPage === 1 || loading}
              >
                &lsaquo; Previous
              </button>
              <span className="dash-page-btn active" aria-current="page">Page {currentPage}</span>
              <button
                type="button"
                className="dash-page-btn"
                onClick={() => {
                  setSelectedIds(new Set());
                  setCurrentPage(p => p + 1);
                }}
                disabled={!hasNextPage || loading}
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
          onSubmitted={(update) => {
            setSelectedIds(new Set());
            clearEnrolmentCache();
            clearSaCache();
            addToast(`${update.ids.length} enrolment${update.ids.length === 1 ? '' : 's'} submitted for update. Processing will continue in the background.`);
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
            patchEnrolmentCache(assignedIds.map(id => ({ id, fields: { owneridname: ownerName } })));
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
