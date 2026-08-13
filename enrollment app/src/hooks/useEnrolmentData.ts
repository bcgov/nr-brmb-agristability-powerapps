// In-memory cache for enrolment rows (persists while app is open)
let enrolmentRowsCache: Vsi_participantprogramyears[] | null = null;
let pageTokensCache: Record<number, string | undefined> = { 1: undefined };
let pageQueryKeyCache = '';
let hasNextPageCache = false;
const recentProgramYearIdsCacheByCutoff: Record<number, string[]> = {};
let coreAppIdCache: string | null = null;
let coreBaseUrlCache: string | null = null;
let dataverseOrgUrlCache: string | null = null;
let coreAppIdLoaded = false;
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import {
  Vsi_participantprogramyearsvsi_enrolmentstatus,
  Vsi_participantprogramyearsvsi_taskstatus,
  Vsi_participantprogramyearsvsi_enrollmentregionaloffice,
  Vsi_participantprogramyearsvsi_farmingsector,
} from '../generated/models/Vsi_participantprogramyearsModel';
import { AccountsService } from '../generated/services/AccountsService';
import { Vsi_armsconfigurationsService } from '../generated/services/Vsi_armsconfigurationsService';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { Vsi_programyearsService } from '../generated/services/Vsi_programyearsService';
import { Office365UsersService } from '../generated/services/Office365UsersService';
import { ENROLMENT_PAGE_SIZE, buildEnrolmentDirectSearchFilter, escapeODataString, fetchEnrolmentPage, normalizeEnrolmentSearchTerm } from '../data/enrolmentPaging';
import type {
  SortKey,
  SortDir,
  FilterOperator,
  AdvFilterNode,
  AdvFilterField,
  LogicOp,
  QuickFilterState,
} from '../types/enrollment';
import { ADV_FIELD_OPTIONS } from '../constants/columns';
import { getEnrolmentEnFeeVarianceThreshold, setEnrolmentEnFeeVarianceThreshold } from '../constants/varianceThreshold';
import { getEnrolmentStatusLabel, getTaskStatusLabel, getSortValue } from '../utils/helpers';
import { isNodeActive } from '../utils/filterTree';

function normalizeCoreBaseUrl(url: string | null | undefined) {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return /\/main\.aspx(?:$|[?#])/i.test(trimmed) ? trimmed : `${trimmed.replace(/\/$/, '')}/main.aspx`;
}

function normalizeOrgUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  // Strip /main.aspx if present, ensure trailing slash
  return trimmed.replace(/\/main\.aspx.*$/i, '').replace(/\/?$/, '/');
}

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

export function getCoreConfig(): { coreAppId: string | null; coreBaseUrl: string | null; dataverseOrgUrl: string | null } {
  return { coreAppId: coreAppIdCache, coreBaseUrl: coreBaseUrlCache, dataverseOrgUrl: dataverseOrgUrlCache };
}

export { normalizeCoreBaseUrl };

export function hasEnrolmentCache(): boolean {
  return enrolmentRowsCache !== null;
}


// Patch specific records in the in-memory cache by enrolment ID.
// Called by other pages (e.g. SupervisorApprovalPage) after mutating enrolment fields
// so the dashboard table reflects the change without a full reload.
export function clearEnrolmentCache(): void {
  enrolmentRowsCache = null;
}

export function patchEnrolmentCache(patches: Array<{ id: string; fields: Partial<Vsi_participantprogramyears> }>) {
  if (!enrolmentRowsCache) return;
  const patchMap = new Map(patches.map(p => [p.id.replace(/[{}]/g, '').toLowerCase(), p.fields]));
  enrolmentRowsCache = enrolmentRowsCache.map(row => {
    const rowId = row.vsi_participantprogramyearid?.replace(/[{}]/g, '').toLowerCase();
    if (!rowId) return row;
    const patch = patchMap.get(rowId);
    return patch ? { ...row, ...patch } : row;
  });
}

/**
 * Builds an OData search clause that matches PIN, farm/corporation name,
 * partnership name, or any enrolment whose participant account name contains
 * the search term.
 */
export async function buildParticipantSearchClause(term: string): Promise<string> {
  const escaped = escapeODataString(term);
  const directClause = buildEnrolmentDirectSearchFilter(term);
  try {
    const result = await AccountsService.getAll({
      select: ['accountid'],
      filter: `contains(name, '${escaped}')`,
      maxPageSize: 50,
    });
    const ids = (result.data ?? [])
      .map(a => a.accountid?.replace(/[{}]/g, '').toLowerCase())
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return `(${directClause})`;
    const participantClause = `(${ids.map(id => `_vsi_participantid_value eq ${id}`).join(' or ')})`;
    return `((${directClause}) or ${participantClause})`;
  } catch {
    return `(${directClause})`;
  }
}

export function useEnrolmentData() {
  const pageTokensRef = useRef<Record<number, string | undefined>>(pageTokensCache);
  const queryKeyRef = useRef(pageQueryKeyCache);
  const requestIdRef = useRef(0);
  const [rows, setRows] = useState<Vsi_participantprogramyears[]>(() => enrolmentRowsCache || []);
  const [loading, setLoading] = useState(() => enrolmentRowsCache === null);
  const [hasNextPage, setHasNextPage] = useState(hasNextPageCache);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [coreAppId, setCoreAppId] = useState<string | null>(() => (coreAppIdLoaded ? coreAppIdCache : null));
  const [coreBaseUrl, setCoreBaseUrl] = useState<string | null>(() => (coreAppIdLoaded ? coreBaseUrlCache : null));

  const fetchCoreAppId = useCallback(async () => {
    try {
      const result = await Vsi_armsconfigurationsService.getAll({
        maxPageSize: 50,
        select: ['cr4dd_coreappid', 'vsi_coreenvironmenturl', 'vsi_enrolmentenfeevariancethreshold'],
      });
      const configRows = result.data ?? [];
      const nextCoreAppId = configRows
        .map(row => row.cr4dd_coreappid?.trim())
        .find((candidate): candidate is string => !!candidate) ?? null;
      const nextCoreBaseUrl = configRows
        .map(row => normalizeCoreBaseUrl(row.vsi_coreenvironmenturl))
        .find((candidate): candidate is string => !!candidate) ?? null;
      const nextVarianceThreshold = configRows
        .map(row => row.vsi_enrolmentenfeevariancethreshold)
        .find((candidate): candidate is number => Number.isFinite(candidate as number));
      setCoreAppId(nextCoreAppId);
      setCoreBaseUrl(nextCoreBaseUrl);
      setEnrolmentEnFeeVarianceThreshold(nextVarianceThreshold);
      coreAppIdCache = nextCoreAppId;
      coreBaseUrlCache = nextCoreBaseUrl;
      dataverseOrgUrlCache = normalizeOrgUrl(configRows.map(r => r.vsi_coreenvironmenturl).find(u => !!u?.trim()));
      coreAppIdLoaded = true;
    } catch {
      if (!coreAppIdLoaded) {
        setCoreAppId(null);
        setCoreBaseUrl(null);
        coreAppIdCache = null;
        coreBaseUrlCache = null;
        setEnrolmentEnFeeVarianceThreshold(null);
        coreAppIdLoaded = true;
      }
    }
  }, []);

  const getRecentProgramYearIds = useCallback(async (yearsBack = 5) => {
    const normalizedYearsBack = Math.min(10, Math.max(1, yearsBack));
    const cutoffYear = new Date().getFullYear() - (normalizedYearsBack - 1);
    if (recentProgramYearIdsCacheByCutoff[cutoffYear]) {
      return recentProgramYearIdsCacheByCutoff[cutoffYear];
    }

    const ids: string[] = [];
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
        if (yearNum == null || yearNum < cutoffYear) continue;
        if (!row.vsi_programyearid) continue;
        ids.push(row.vsi_programyearid.replace(/[{}]/g, '').toLowerCase());
      }
      const raw = result as unknown as Record<string, unknown>;
      skipToken = (raw['skipToken'] ?? raw['@odata.nextLink']) as string | undefined;
    } while (skipToken);

    recentProgramYearIdsCacheByCutoff[cutoffYear] = ids;
    return ids;
  }, []);

  // Retrieve exactly one Dataverse page. Continuation tokens are cached per
  // sequential page and reset whenever any server query input changes.
  const fetchEnrolments = useCallback(async (options?: { page?: number; searchTerm?: string; yearsBack?: number; serverFilter?: string; orderBy?: string[] }): Promise<boolean> => {
    const requestId = ++requestIdRef.current;
    const page = Math.max(1, options?.page ?? 1);
    const yearsBack = Math.min(10, Math.max(1, options?.yearsBack ?? 5));
    const normalizedSearch = normalizeEnrolmentSearchTerm(options?.searchTerm ?? '');
    const serverFilter = options?.serverFilter?.trim() ?? '';
    const serverOrderBy = options?.orderBy?.length
      ? options.orderBy
      : ['modifiedon desc', 'vsi_participantprogramyearid asc'];
    const queryKey = JSON.stringify([
      yearsBack,
      normalizedSearch.toLowerCase(),
      serverFilter,
      serverOrderBy,
    ]);

    if (page === 1 || queryKeyRef.current !== queryKey) {
      queryKeyRef.current = queryKey;
      pageTokensRef.current = { 1: undefined };
      pageQueryKeyCache = queryKey;
      pageTokensCache = pageTokensRef.current;
    }

    if (page > 1 && !pageTokensRef.current[page]) {
      setError('The requested page is not available. Return to the first page and try again.');
      return false;
    }

    setLoading(true);
    setError(null);
    try {
      const cutoffYear = new Date().getFullYear() - (yearsBack - 1);
      const recentProgramYearIds = await getRecentProgramYearIds(yearsBack);
      const recentYearFilter = recentProgramYearIds.length > 0
        ? `(${recentProgramYearIds.map(id => `_vsi_programyearid_value eq ${id}`).join(' or ')})`
        : `vsi_programyearidname ge '${cutoffYear}'`;
      const filters = [recentYearFilter];
      if (serverFilter) filters.push(`(${serverFilter})`);
      if (normalizedSearch) {
        filters.push(await buildParticipantSearchClause(normalizedSearch));
      }

      const result = await fetchEnrolmentPage(
        serviceOptions => Vsi_participantprogramyearsService.getAll(serviceOptions),
        {
          pageSize: ENROLMENT_PAGE_SIZE,
          filter: filters.join(' and '),
          orderBy: serverOrderBy,
          pageToken: pageTokensRef.current[page],
        },
      );

      if (requestId !== requestIdRef.current) return false;
      if (result.nextPageToken) {
        pageTokensRef.current[page + 1] = result.nextPageToken;
      } else {
        delete pageTokensRef.current[page + 1];
      }
      setRows(result.rows);
      setHasNextPage(result.hasNextPage);
      pageTokensCache = pageTokensRef.current;
      hasNextPageCache = result.hasNextPage;
      enrolmentRowsCache = result.rows;
      return true;
    } catch (e: unknown) {
      if (requestId !== requestIdRef.current) return false;
      console.error('Error fetching enrolments:', e);
      setError(e instanceof Error ? e.message : 'Failed to load enrolments');
      return false;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [getRecentProgramYearIds]);

  useEffect(() => {
    if (coreAppIdLoaded) return;
    fetchCoreAppId();
  }, [fetchCoreAppId]);

  // Fetch avatar photos
  useEffect(() => {
    if (rows.length === 0) return;
    const ids = new Set<string>();
    for (const row of rows) {
      const raw = row as unknown as Record<string, unknown>;
      const ownerUid = raw['_ownerid_value'] as string | undefined;
      if (ownerUid) ids.add(ownerUid);
    }
    let cancelled = false;
    (async () => {
      const photos: Record<string, string> = {};
      await Promise.all([...ids].map(async (uid) => {
        try {
          const result = await Office365UsersService.UserPhoto_V2(uid);
          if (!cancelled && result.data) {
            photos[uid] = result.data;
          }
        } catch { /* no photo available */ }
      }));
      if (!cancelled) setAvatarUrls(photos);
    })();
    return () => { cancelled = true; };
  }, [rows]);

  return { rows, setRows, loading, hasNextPage, pageSize: ENROLMENT_PAGE_SIZE, error, avatarUrls, fetchEnrolments, coreAppId, coreBaseUrl, fetchCoreAppId };
}

export function useSortedAndFilteredRows(
  rows: Vsi_participantprogramyears[],
  sortKey: SortKey | null,
  sortDir: SortDir,
  filters: QuickFilterState,
  taskStatusFilter: Set<string>,
  enrolStatusFilter: Set<string>,
  yearFilter: Set<string>,
  ownerFilter: Set<string>,
  taskFilterOp: FilterOperator,
  enrolFilterOp: FilterOperator,
  advFilterNodes: AdvFilterNode[],
  advLogicOp: LogicOp,
  currentUserName?: string,
) {
  const taskStatusOptions = useMemo(() =>
    Object.values(Vsi_participantprogramyearsvsi_taskstatus) as string[],
  []);
  const enrolStatusOptions = useMemo(() =>
    Object.values(Vsi_participantprogramyearsvsi_enrolmentstatus) as string[],
  []);

  const yearOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows) {
      const raw = row as unknown as Record<string, unknown>;
      const name = (row.vsi_programyearidname
        ?? raw['_vsi_programyearid_value@OData.Community.Display.V1.FormattedValue']
        ?? '') as string;
      if (name) seen.add(name);
    }
    return [...seen].sort();
  }, [rows]);

  const ownerOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows) {
      const raw = row as unknown as Record<string, unknown>;
      const name = (row.owneridname
        ?? raw['_ownerid_value@OData.Community.Display.V1.FormattedValue']
        ?? '') as string;
      if (name) seen.add(name);
    }
    const sorted = [...seen].sort((a, b) => a.localeCompare(b));
    if (currentUserName && seen.has(currentUserName)) {
      return [currentUserName, ...sorted.filter(n => n !== currentUserName)];
    }
    return sorted;
  }, [rows, currentUserName]);

  const getRowFieldValue = useCallback((row: Vsi_participantprogramyears, field: AdvFilterField): string => {
    const raw = row as unknown as Record<string, unknown>;
    switch (field) {
      case 'taskStatus': return getTaskStatusLabel(row.vsi_taskstatus);
      case 'enrolStatus': return getEnrolmentStatusLabel(row.vsi_enrolmentstatus);
      case 'pin': return row.vsi_name ?? '';
      case 'producer':
        return (row.vsi_participantidname
          ?? raw['_vsi_participantid_value@OData.Community.Display.V1.FormattedValue']
          ?? '') as string;
      case 'owner':
        return (row.owneridname
          ?? raw['_ownerid_value@OData.Community.Display.V1.FormattedValue']
          ?? '') as string;
      case 'year':
        return (row.vsi_programyearidname
          ?? raw['_vsi_programyearid_value@OData.Community.Display.V1.FormattedValue']
          ?? '') as string;
      case 'fee': return String(row.vsi_totalfeesowedcalculated ?? '');
      case 'hasPartners': return row.vsi_haspartners === true ? 'Yes' : 'No';
      case 'inCombinedFarm': return row.vsi_incombinedfarm === true ? 'Yes' : 'No';
      case 'isNewParticipant': return row.vsi_isnewparticipant === true ? 'Yes' : 'No';
      case 'fullyProvinciallyFunded': return row.vsi_fullyprovinciallyfunded === true ? 'Yes' : 'No';
      case 'bringForward': return row.vsi_bringforward === true ? 'Yes' : 'No';
      case 'broughtForward': return row.vsi_broughtforward === true ? 'Yes' : 'No';
      case 'manualReview': return row.vsi_manualreview === true ? 'Yes' : 'No';
      case 'totalFeesOwed': // legacy alias — treat as totalFeesOwedCalculated
      case 'totalFeesOwedCalculated': return String(row.vsi_totalfeesowedcalculated ?? '');
      case 'totalFeesPaid': return String(row.vsi_totalfeespaid ?? '');
      case 'latePay': return String(row.vsi_latepaymentfee ?? '');
      case 'nonPenaltyDeadlineDaysLeft': return String(row.vsi_nonpenaltydeadlinedaysleft ?? '');
      case 'finalDeadlineDaysDiff': return String(row.vsi_finaldeadlinedaysdiff ?? '');
      case 'lateFinalDeadlineDaysDiff': return String(row.vsi_latefinaldeadlinedaysdiff ?? '');
      case 'regionalOffice': return Vsi_participantprogramyearsvsi_enrollmentregionaloffice[row.vsi_enrollmentregionaloffice as keyof typeof Vsi_participantprogramyearsvsi_enrollmentregionaloffice] ?? '';
      case 'farmingSector': return Vsi_participantprogramyearsvsi_farmingsector[row.vsi_farmingsector as keyof typeof Vsi_participantprogramyearsvsi_farmingsector] ?? '';
      case 'modifiedOn': return row.modifiedon ?? '';
      case 'enrolmentNoticeSentDate': return row.vsi_enrolmentnoticesentdate ?? '';
      case 'lateEnrolmentNoticeSentDate': return row.vsi_lateenrolmentnoticesentdate ?? '';
      case 'enrolmentOptedOutDate': return row.vsi_programyearoptoutdate ?? '';
      case 'fileReceivedDate': return row.vsi_filereceiveddate ?? '';
      case 'feesPaidDate': return row.vsi_enrolmentfeespaiddate ?? '';
      default: return '';
    }
  }, []);

  const matchAdvRow = useCallback((row: Vsi_participantprogramyears, fr: { kind: 'row'; field: AdvFilterField; operator: string; values: Set<string>; textValue: string }): boolean => {
    const val = getRowFieldValue(row, fr.field);
    const fieldType = ADV_FIELD_OPTIONS[fr.field];
    // Null-check operators: test whether the field has any value
    if (fr.operator === 'hasValue') return val !== '';
    if (fr.operator === 'hasNoValue') return val === '';
    if (fieldType === 'choice') {
      if (fr.values.size === 0) return true;
      const inSet = fr.values.has(val);
      return fr.operator === 'equals' ? inSet : !inSet;
    }
    if (fieldType === 'number') {
      if (fr.operator === 'hasValue') return val !== '';
      if (fr.operator === 'hasNoValue') return val === '';
      const num = Number(val);
      const search = Number(fr.textValue);
      if (!Number.isFinite(num) || !Number.isFinite(search)) return true;
      switch (fr.operator) {
        case 'equals': return num === search;
        case 'notEquals': return num !== search;
        case 'greaterThan': return num > search;
        case 'greaterThanOrEqual': return num >= search;
        case 'lessThan': return num < search;
        case 'lessThanOrEqual': return num <= search;
        default: return true;
      }
    }
    if (!fr.textValue) return true;
    const lower = val.toLowerCase();
    const search = fr.textValue.toLowerCase();
    switch (fr.operator) {
      case 'equals': return lower === search;
      case 'notEquals': return lower !== search;
      case 'contains': return lower.includes(search);
      case 'notContains': return !lower.includes(search);
      case 'beginsWith': return lower.startsWith(search);
      case 'endsWith': return lower.endsWith(search);
      default: return true;
    }
  }, [getRowFieldValue]);

  const matchAdvNode = useCallback((row: Vsi_participantprogramyears, node: AdvFilterNode): boolean => {
    const evaluate = (currentNode: AdvFilterNode): boolean => {
      if (currentNode.kind === 'row') return matchAdvRow(row, currentNode);
      const activeChildren = currentNode.children.filter(isNodeActive);
      if (activeChildren.length === 0) return true;
      if (currentNode.logic === 'AND') return activeChildren.every(ch => evaluate(ch));
      return activeChildren.some(ch => evaluate(ch));
    };
    return evaluate(node);
  }, [matchAdvRow]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const anyFilter = filters.verifiedCalc || filters.unverifiedCalc || filters.flagged || filters.partnerships || filters.fortyFiveDayLetter;

  const isYesValue = useCallback((value: unknown): boolean => {
    if (value === true || value === 1 || value === '1') return true;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'yes' || normalized === 'true';
    }
    return false;
  }, []);

  const isFlaggedByVariance = useCallback((row: Vsi_participantprogramyears): boolean => {
    if (row.vsi_prevyearpartnotverified === true && row.vsi_isnewparticipant !== true) return true;
    if (row.vsi_isnewparticipant !== true && row.vsi_enrolmentfee != null && row.vsi_previousyearcalculatedenfee == null) return true;
    const variance = row.vsi_variancecalculation != null ? row.vsi_variancecalculation * 100 : null;
    if (variance == null) return false;
    return Math.abs(variance) >= getEnrolmentEnFeeVarianceThreshold();
  }, []);

  const filteredRows = useMemo(() => {
    let result = sortedRows;

    if (anyFilter) {
      result = result.filter(row => {
        const matchesVerifiedCalc = getEnrolmentStatusLabel(row.vsi_enrolmentstatus) === 'VerifiedENCalculalted';
        const matchesUnverifiedCalc = getEnrolmentStatusLabel(row.vsi_enrolmentstatus) === 'UnverifiedENCalculated';
        const matchesFlagged = isFlaggedByVariance(row);
        const matchesPartnerships = isYesValue(row.vsi_haspartners) || isYesValue(row.vsi_incombinedfarm);
        const matchesFortyFiveDayLetter = getEnrolmentStatusLabel(row.vsi_enrolmentstatus) === '_45DayLetter';
        if (filters.verifiedCalc && !matchesVerifiedCalc) return false;
        if (filters.unverifiedCalc && !matchesUnverifiedCalc) return false;
        if (filters.flagged && !matchesFlagged) return false;
        if (filters.partnerships && !matchesPartnerships) return false;
        if (filters.fortyFiveDayLetter && !matchesFortyFiveDayLetter) return false;
        return true;
      });
    }

    if (taskStatusFilter.size > 0) {
      result = result.filter(row => {
        const match = taskStatusFilter.has(getTaskStatusLabel(row.vsi_taskstatus));
        return taskFilterOp === 'equals' ? match : !match;
      });
    }
    if (enrolStatusFilter.size > 0) {
      result = result.filter(row => {
        const match = enrolStatusFilter.has(getEnrolmentStatusLabel(row.vsi_enrolmentstatus));
        return enrolFilterOp === 'equals' ? match : !match;
      });
    }

    if (yearFilter.size > 0) {
      result = result.filter(row => {
        const raw = row as unknown as Record<string, unknown>;
        const name = (row.vsi_programyearidname
          ?? raw['_vsi_programyearid_value@OData.Community.Display.V1.FormattedValue']
          ?? '') as string;
        return yearFilter.has(name);
      });
    }

    if (ownerFilter.size > 0) {
      result = result.filter(row => {
        const raw = row as unknown as Record<string, unknown>;
        const name = (row.owneridname
          ?? raw['_ownerid_value@OData.Community.Display.V1.FormattedValue']
          ?? '') as string;
        return ownerFilter.has(name);
      });
    }

    const activeAdvNodes = advFilterNodes.filter(isNodeActive);
    if (activeAdvNodes.length > 0) {
      result = result.filter(row => {
        if (advLogicOp === 'AND') return activeAdvNodes.every(n => matchAdvNode(row, n));
        return activeAdvNodes.some(n => matchAdvNode(row, n));
      });
    }

    return result;
  }, [sortedRows, filters, anyFilter, taskStatusFilter, enrolStatusFilter, yearFilter, ownerFilter, taskFilterOp, enrolFilterOp, advFilterNodes, advLogicOp, matchAdvNode, isYesValue, isFlaggedByVariance]);

  return { filteredRows, taskStatusOptions, enrolStatusOptions, yearOptions, ownerOptions };
}
