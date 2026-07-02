// In-memory cache for enrolment rows (persists while app is open)
let enrolmentRowsCache: Vsi_participantprogramyears[] | null = null;
let recentProgramYearIdsCacheByCutoff: Record<number, string[]> = {};
let coreAppIdCache: string | null = null;
let coreBaseUrlCache: string | null = null;
let dataverseOrgUrlCache: string | null = null;
let coreAppIdLoaded = false;
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import {
  Vsi_participantprogramyearsvsi_enrolmentstatus,
  Vsi_participantprogramyearsvsi_taskstatus,
} from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_armsconfigurationsService } from '../generated/services/Vsi_armsconfigurationsService';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { Vsi_programyearsService } from '../generated/services/Vsi_programyearsService';
import { Office365UsersService } from '../generated/services/Office365UsersService';
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

export function useEnrolmentData() {
  const PAGE_SIZE = 300;
  const pageTokensRef = useRef<Record<number, string | undefined>>({ 1: undefined });
  const searchKeyRef = useRef('');
  const orderByKeyRef = useRef('vsi_taskstatus desc');
  const [rows, setRows] = useState<Vsi_participantprogramyears[]>(() => enrolmentRowsCache || []);
  const [loading, setLoading] = useState(() => enrolmentRowsCache === null);
  const [hasNextPage, setHasNextPage] = useState(false);
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

  const escapeODataLiteral = (value: string) => value.replace(/'/g, "''");

  // Fetch all rows for the default 5-year scope (client-side filtering/search after load)
  const fetchEnrolments = useCallback(async (options?: { mode?: 'client' | 'server'; page?: number; searchTerm?: string; yearsBack?: number; serverFilter?: string; orderBy?: string[] }): Promise<boolean> => {
    const mode = options?.mode ?? 'client';
    const yearsBack = Math.min(10, Math.max(1, options?.yearsBack ?? 5));
    setLoading(true);
    setError(null);
    try {
      if (mode === 'server') {
        const page = Math.max(1, options?.page ?? 1);
        const normalizedSearch = (options?.searchTerm ?? '').trim();
        const normalizedSearchKey = normalizedSearch.toLowerCase();
        const serverOrderBy = options?.orderBy?.length ? options.orderBy : ['vsi_taskstatus desc'];
        const normalizedOrderByKey = serverOrderBy.join('|');
        const searchChanged = searchKeyRef.current !== normalizedSearchKey;
        const orderByChanged = orderByKeyRef.current !== normalizedOrderByKey;
        if (searchChanged) {
          searchKeyRef.current = normalizedSearchKey;
        }
        if (orderByChanged) {
          orderByKeyRef.current = normalizedOrderByKey;
        }

        if (page === 1 || searchChanged || orderByChanged) {
          pageTokensRef.current = { 1: undefined };
        }

        const cutoffYear = new Date().getFullYear() - (yearsBack - 1);
        const recentProgramYearIds = await getRecentProgramYearIds(yearsBack);
        const recentYearFilter = recentProgramYearIds.length > 0
          ? `(${recentProgramYearIds.map(id => `_vsi_programyearid_value eq ${id}`).join(' or ')})`
          : `vsi_programyearidname ge '${cutoffYear}'`;

        const filters = [recentYearFilter];
        if (options?.serverFilter?.trim()) {
          filters.push(`(${options.serverFilter.trim()})`);
        }
        if (normalizedSearch) {
          filters.push(`contains(vsi_name, '${escapeODataLiteral(normalizedSearch)}')`);
        }

        const baseOptions = {
          maxPageSize: PAGE_SIZE,
          select: [
            'vsi_name',
            '_vsi_participantid_value',
            '_vsi_programyearid_value',
            'vsi_enrolmentstatus',
            'vsi_taskstatus',
            'vsi_enrolmentfee',
            'vsi_previousyearcalculatedenfee',
            'vsi_administrativecostsharingfee',
            'vsi_enrolmentfeecalculated',
            'vsi_totalfeesowed',
            'vsi_totalfeesowedcalculated',
            'vsi_totalfeespaid',
            'vsi_enrolmentfee',
            'vsi_latepaymentfee',
            'vsi_haspartners',
            'vsi_incombinedfarm',
            'vsi_sharepointdocumentfolder',
            'modifiedon',
            '_ownerid_value',
            'vsi_enrollmentregionaloffice',
            'vsi_farmingsector',
            'vsi_bringforward',
            'vsi_broughtforward',
            'vsi_manualreview',
            'vsi_enrolmentnoticesentdate',
            'vsi_enrolmentfeesnonpenaltyduedate',
            'vsi_enrolmentfeesfinaldeadlinedate',
            'vsi_nonpenaltydeadlineremindersent',
            'vsi_finaldeadlineremindersent',
            'vsi_programyearoptoutdate',
            'vsi_fortyfivedayletterstartdate',
            'vsi_fortyfivedaycounterpaused',
            'vsi_fortyfivedaypausedate',
            'vsi_filereceiveddate',
            'vsi_enrolmentfeespaiddate',
            'vsi_prevyearpartnotverified',
            'vsi_variancecalculation',
            'vsi_isnewparticipant',
            'vsi_fullyprovinciallyfunded',
          ],
          orderBy: serverOrderBy,
          filter: filters.join(' and '),
        };

        if (page > 1 && typeof pageTokensRef.current[page] === 'undefined') {
          const knownPages = Object.keys(pageTokensRef.current)
            .map(k => Number(k))
            .filter(k => Number.isFinite(k) && k >= 1 && k <= page)
            .sort((a, b) => b - a);
          const startPage = knownPages[0] ?? 1;
          let traversalToken = pageTokensRef.current[startPage];

          for (let p = startPage; p < page; p += 1) {
            const probeResult = await Vsi_participantprogramyearsService.getAll({
              ...baseOptions,
              ...(traversalToken ? { skipToken: traversalToken } : {}),
            });
            const probeRaw = probeResult as unknown as Record<string, unknown>;
            const nextToken = (probeRaw['skipToken'] ?? probeRaw['@odata.nextLink']) as string | undefined;
            if (!nextToken) {
              setError(`Page ${page} is out of range for this query.`);
              return false;
            }
            pageTokensRef.current[p + 1] = nextToken;
            traversalToken = nextToken;
          }
        }

        const pageToken = pageTokensRef.current[page];
        const result = await Vsi_participantprogramyearsService.getAll({
          ...baseOptions,
          ...(pageToken ? { skipToken: pageToken } : {}),
        });

        const pageRows = result.data ?? [];
        const raw = result as unknown as Record<string, unknown>;
        const nextToken = (raw['skipToken'] ?? raw['@odata.nextLink']) as string | undefined;

        if (nextToken) {
          pageTokensRef.current[page + 1] = nextToken;
        } else {
          delete pageTokensRef.current[page + 1];
        }

        setRows(pageRows);
        setHasNextPage(Boolean(nextToken));
        enrolmentRowsCache = pageRows;
        return true;
      }

      const cutoffYear = new Date().getFullYear() - (yearsBack - 1);
      const recentProgramYearIds = await getRecentProgramYearIds(yearsBack);
      const recentYearFilter = recentProgramYearIds.length > 0
        ? `(${recentProgramYearIds.map(id => `_vsi_programyearid_value eq ${id}`).join(' or ')})`
        : `vsi_programyearidname ge '${cutoffYear}'`;

      const baseOptions = {
        maxPageSize: 5000,
        select: [
          'vsi_name',
          '_vsi_participantid_value',
          '_vsi_programyearid_value',
          'vsi_enrolmentstatus',
          'vsi_taskstatus',
          'vsi_enrolmentfee',
          'vsi_previousyearcalculatedenfee',
          'vsi_administrativecostsharingfee',
          'vsi_enrolmentfeecalculated',
          'vsi_totalfeesowed',
          'vsi_totalfeesowedcalculated',
          'vsi_totalfeespaid',
          'vsi_enrolmentfee',
          'vsi_latepaymentfee',
          'vsi_haspartners',
          'vsi_incombinedfarm',
          'vsi_sharepointdocumentfolder',
          'modifiedon',
          '_ownerid_value',
          'vsi_enrollmentregionaloffice',
          'vsi_farmingsector',
          'vsi_bringforward',
          'vsi_broughtforward',
          'vsi_manualreview',
          'vsi_enrolmentnoticesentdate',
          'vsi_enrolmentfeesnonpenaltyduedate',
          'vsi_enrolmentfeesfinaldeadlinedate',
          'vsi_nonpenaltydeadlineremindersent',
          'vsi_finaldeadlineremindersent',
          'vsi_programyearoptoutdate',
          'vsi_fortyfivedayletterstartdate',
          'vsi_fortyfivedaycounterpaused',
          'vsi_fortyfivedaypausedate',
          'vsi_filereceiveddate',
          'vsi_enrolmentfeespaiddate',
          'vsi_prevyearpartnotverified',
          'vsi_variancecalculation',
          'vsi_isnewparticipant',
          'vsi_fullyprovinciallyfunded',
        ],
        orderBy: ['vsi_taskstatus desc'],
        filter: recentYearFilter,
      };

      const allRows: Vsi_participantprogramyears[] = [];
      let skipToken: string | undefined;
      do {
        const result = await Vsi_participantprogramyearsService.getAll({
          ...baseOptions,
          ...(skipToken ? { skipToken } : {}),
        });
        allRows.push(...(result.data ?? []));
        const raw = result as unknown as Record<string, unknown>;
        skipToken = (raw['skipToken'] ?? raw['@odata.nextLink']) as string | undefined;
      } while (skipToken);

      setRows(allRows);
      setHasNextPage(false);
      enrolmentRowsCache = allRows;
      pageTokensRef.current = { 1: undefined };
      searchKeyRef.current = '';
      return true;
    } catch (e: unknown) {
      console.error('Error fetching enrolments:', e);
      setError(e instanceof Error ? e.message : 'Failed to load enrolments');
      return false;
    } finally {
      setLoading(false);
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

  return { rows, setRows, loading, hasNextPage, pageSize: PAGE_SIZE, error, avatarUrls, fetchEnrolments, coreAppId, coreBaseUrl, fetchCoreAppId };
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
      case 'fee': return String(row.vsi_enrolmentfee ?? '');
      case 'hasPartners': return row.vsi_haspartners === true ? 'Yes' : 'No';
      case 'inCombinedFarm': return row.vsi_incombinedfarm === true ? 'Yes' : 'No';
      case 'isNewParticipant': return row.vsi_isnewparticipant === true ? 'Yes' : 'No';
      default: return '';
    }
  }, []);

  const matchAdvRow = useCallback((row: Vsi_participantprogramyears, fr: { kind: 'row'; field: AdvFilterField; operator: string; values: Set<string>; textValue: string }): boolean => {
    const val = getRowFieldValue(row, fr.field);
    const fieldType = ADV_FIELD_OPTIONS[fr.field];
    if (fieldType === 'choice') {
      if (fr.values.size === 0) return true;
      const inSet = fr.values.has(val);
      return fr.operator === 'equals' ? inSet : !inSet;
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
    if (row.vsi_prevyearpartnotverified === true) return true;
    if (row.vsi_enrolmentfee != null && row.vsi_previousyearcalculatedenfee == null) return true;
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