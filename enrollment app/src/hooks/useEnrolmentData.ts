import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import {
  Vsi_participantprogramyearsvsi_enrolmentstatus,
  Vsi_participantprogramyearsvsi_taskstatus,
} from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { Office365UsersService } from '../generated/services/Office365UsersService';
import type { SortKey, SortDir, FilterOperator, AdvFilterNode, AdvFilterField, LogicOp } from '../types/enrollment';
import { ADV_FIELD_OPTIONS } from '../constants/columns';
import { getEnrolmentStatusLabel, getTaskStatusLabel, getSortValue } from '../utils/helpers';
import { isNodeActive } from '../utils/filterTree';

export function useEnrolmentData() {
  const [rows, setRows] = useState<Vsi_participantprogramyears[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const allRows: Vsi_participantprogramyears[] = [];
        let skipToken: string | undefined;
        const baseOptions = {
          maxPageSize: 5000,
          select: [
            'vsi_name',
            '_vsi_participantid_value',
            '_vsi_programyearid_value',
            'vsi_enrolmentstatus',
            'vsi_taskstatus',
            'vsi_calculatedenfee',
            'vsi_enrolmentfeecalculated',
            'vsi_totalfeesowed',
            'vsi_totalfeespaid',
            'vsi_enrolmentfee',
            'vsi_latepaymentfee',
            'vsi_haspartners',
            'vsi_incombinedfarm',
            'vsi_sharepointdocumentfolder',
            '_modifiedby_value',
            'modifiedon',
            'vsi_enrollmentregionaloffice',
            'vsi_farmingsector',
            'vsi_bringforward',
            'vsi_broughtforward',
            'vsi_manualreview',
            'vsi_enrolmentnoticesentdate',
            'vsi_filereceiveddate',
            'vsi_enrolmentfeespaiddate',
          ],
          orderBy: ['vsi_taskstatus desc'],
        };
        do {
          const result = await Vsi_participantprogramyearsService.getAll({
            ...baseOptions,
            ...(skipToken ? { skipToken } : {}),
          });
          if (cancelled) return;
          allRows.push(...(result.data ?? []));
          const raw = result as unknown as Record<string, unknown>;
          skipToken = (raw['skipToken'] ?? raw['@odata.nextLink']) as string | undefined;
        } while (skipToken);
        if (!cancelled) setRows(allRows);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load enrolments');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch avatar photos
  useEffect(() => {
    if (rows.length === 0) return;
    const ids = new Set<string>();
    for (const row of rows) {
      const raw = row as unknown as Record<string, unknown>;
      const uid = raw['_modifiedby_value'] as string | undefined;
      if (uid) ids.add(uid);
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

  return { rows, loading, error, avatarUrls };
}

export function useSortedAndFilteredRows(
  rows: Vsi_participantprogramyears[],
  sortKey: SortKey | null,
  sortDir: SortDir,
  filters: { verifiedCalc: boolean; unverifiedCalc: boolean; flagged: boolean; partnerships: boolean },
  taskStatusFilter: Set<string>,
  enrolStatusFilter: Set<string>,
  taskFilterOp: FilterOperator,
  enrolFilterOp: FilterOperator,
  advFilterNodes: AdvFilterNode[],
  advLogicOp: LogicOp,
) {
  const taskStatusOptions = useMemo(() =>
    Object.values(Vsi_participantprogramyearsvsi_taskstatus) as string[],
  []);
  const enrolStatusOptions = useMemo(() =>
    Object.values(Vsi_participantprogramyearsvsi_enrolmentstatus) as string[],
  []);

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
      case 'fee': return String(row.vsi_calculatedenfee ?? '');
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
    if (node.kind === 'row') return matchAdvRow(row, node);
    const activeChildren = node.children.filter(isNodeActive);
    if (activeChildren.length === 0) return true;
    if (node.logic === 'AND') return activeChildren.every(ch => matchAdvNode(row, ch));
    return activeChildren.some(ch => matchAdvNode(row, ch));
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

  const anyFilter = filters.verifiedCalc || filters.unverifiedCalc || filters.flagged || filters.partnerships;

  const filteredRows = useMemo(() => {
    let result = sortedRows;

    if (anyFilter) {
      result = result.filter(row => {
        const isEnCalc = row.vsi_enrolmentfeecalculated === 1;
        const isReady = row.vsi_taskstatus === 865520002;
        if (filters.verifiedCalc && isReady && isEnCalc) return true;
        if (filters.unverifiedCalc && !isReady && isEnCalc) return true;
        if (filters.flagged && !!row.vsi_sharepointdocumentfolder) return true;
        if (filters.partnerships && (row.vsi_haspartners === 1 || row.vsi_incombinedfarm === 1)) return true;
        return false;
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

    const activeAdvNodes = advFilterNodes.filter(isNodeActive);
    if (activeAdvNodes.length > 0) {
      result = result.filter(row => {
        if (advLogicOp === 'AND') return activeAdvNodes.every(n => matchAdvNode(row, n));
        return activeAdvNodes.some(n => matchAdvNode(row, n));
      });
    }

    return result;
  }, [sortedRows, filters, anyFilter, taskStatusFilter, enrolStatusFilter, taskFilterOp, enrolFilterOp, advFilterNodes, advLogicOp, matchAdvNode]);

  return { filteredRows, taskStatusOptions, enrolStatusOptions };
}
