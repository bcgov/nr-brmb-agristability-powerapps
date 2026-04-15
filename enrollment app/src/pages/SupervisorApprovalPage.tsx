import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_participantprogramyearsvsi_enrolmentstatus } from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { QueueitemsService } from '../generated/services/QueueitemsService';
import { QueuesService } from '../generated/services/QueuesService';
import { Office365UsersService } from '../generated/services/Office365UsersService';
import { ColumnHeaderMenu } from '../components/ColumnHeaderMenu';
import { calculateVariance, enrolmentStatusClass, formatCurrencyOr, formatVariancePercent, getEnrolmentStatusLabel, getInitials, getTaskStatusLabel, getVarianceClass } from '../utils/helpers';
import { AssignWorkerModal } from '../components/AssignWorkerModal';
import type { FilterOperator, SortDir } from '../types/enrollment';
import { resolveCurrentSystemUser } from '../utils/currentUser';
import '../styles/supervisor-approval.css';

const PAGE_SIZE = 20;
const SUPERVISOR_QUEUE_NAME = 'Supervisor Approval Queue';
const ENROLMENT_STATUS_FILTER_OPTIONS = Object.values(Vsi_participantprogramyearsvsi_enrolmentstatus)
  .filter((label): label is (typeof Vsi_participantprogramyearsvsi_enrolmentstatus)[keyof typeof Vsi_participantprogramyearsvsi_enrolmentstatus] => typeof label === 'string' && label.length > 0)
  .sort((a, b) => a.localeCompare(b));

type QueueWorkMeta = {
  workedBy: string;
  workedOn: string;
  workedOnRaw?: string;
  enteredQueue?: string;
  enteredQueueRaw?: string;
  workerId?: string;
  queueitemId?: string;
  queueId?: string;
  queueName?: string;
  isActive?: boolean;
};

type SupervisorColumnKey = 'enrolmentName' | 'participant' | 'taskStatus' | 'enrolmentStatus' | 'calculatedFee' | 'enteredQueue' | 'workedBy' | 'workedOn';

type SupervisorColumnDef = {
  key: SupervisorColumnKey;
  label: string;
};

const SUPERVISOR_COLUMNS: SupervisorColumnDef[] = [
  { key: 'enrolmentName', label: 'Enrolment Name' },
  { key: 'participant', label: 'Participant' },
  { key: 'taskStatus', label: 'Task Status' },
  { key: 'enrolmentStatus', label: 'Enrolment Status' },
  { key: 'calculatedFee', label: 'Calculated Fee' },
  { key: 'enteredQueue', label: 'Entered Queue' },
  { key: 'workedBy', label: 'Worked By' },
  { key: 'workedOn', label: 'Worked On' },
];

const DEFAULT_COLUMN_ORDER: SupervisorColumnKey[] = SUPERVISOR_COLUMNS.map(c => c.key);
const DEFAULT_FILTER_OPS: Record<SupervisorColumnKey, FilterOperator> = {
  enrolmentName: 'equals',
  participant: 'equals',
  taskStatus: 'equals',
  enrolmentStatus: 'equals',
  calculatedFee: 'equals',
  enteredQueue: 'equals',
  workedBy: 'equals',
  workedOn: 'equals',
};

const createEmptyFilters = (): Record<SupervisorColumnKey, Set<string>> => ({
  enrolmentName: new Set(),
  participant: new Set(),
  taskStatus: new Set(),
  enrolmentStatus: new Set(),
  calculatedFee: new Set(),
  enteredQueue: new Set(),
  workedBy: new Set(),
  workedOn: new Set(),
});

type AssignTarget = {
  enrolmentId: string;
  enrolmentName: string;
  queueitemId: string | undefined;
  queueId?: string;
  queueName?: string;
};

function VariancePill({ variance }: { variance: number }) {
  const cls = getVarianceClass(variance);
  const text = formatVariancePercent(variance);
  return <span className={`variance-pill ${cls}`}>{text}</span>;
}

function StatusBadge({ status }: { status?: number }) {
  const label = getTaskStatusLabel(status) || 'Unknown';
  const clsByLabel: Record<string, string> = {
    Manual: 'pending',
    Supervisor: 'review',
    Ready: 'inprogress',
    Approved: 'approved',
  };
  const cls = clsByLabel[label] ?? 'pending';

  return (
    <span className={`sa-status-badge ${cls}`}>
      {label}
    </span>
  );
}

function getRowId(item: Vsi_participantprogramyears): string | null {
  return item.vsi_participantprogramyearid ?? null;
}

function formatWorkedOn(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function normalizeGuid(value?: string | null): string {
  return (value ?? '').replace(/[{}]/g, '').trim().toLowerCase();
}

function isSupervisorApprovalQueueName(name?: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes('supervisor') && n.includes('approval');
}

export function SupervisorApprovalPage() {
  const [items, setItems] = useState<Vsi_participantprogramyears[]>([]);
  const [queueWorkByEnrolmentId, setQueueWorkByEnrolmentId] = useState<Record<string, QueueWorkMeta>>({});
  const [supervisorQueueIds, setSupervisorQueueIds] = useState<Set<string>>(new Set());
  const [workerAvatarUrls, setWorkerAvatarUrls] = useState<Record<string, string>>({});
  const fetchedQueueIds = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [currentUser, setCurrentUser] = useState<{ systemUserId: string; displayName: string } | null>(null);
  const [pickingRowId, setPickingRowId] = useState<string | null>(null);
  const [releasingRowId, setReleasingRowId] = useState<string | null>(null);
  const [approvingRowId, setApprovingRowId] = useState<string | null>(null);
  const [approvingBulk, setApprovingBulk] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<SupervisorColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [colDragIdx, setColDragIdx] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SupervisorColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [columnWidths, setColumnWidths] = useState<Partial<Record<SupervisorColumnKey, number>>>({});
  const [columnFilters, setColumnFilters] = useState<Record<SupervisorColumnKey, Set<string>>>(() => createEmptyFilters());
  const [columnFilterOps, setColumnFilterOps] = useState<Record<SupervisorColumnKey, FilterOperator>>(DEFAULT_FILTER_OPS);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (currentUser) return;
        const resolved = await resolveCurrentSystemUser();
        if (!cancelled) {
          setCurrentUser({
            systemUserId: resolved.systemUserId,
            displayName: resolved.displayName,
          });
        }
      } catch {
        // silently fail
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        fetchedQueueIds.current.clear();
        setLoading(true);
        setError(null);
        const result = await Vsi_participantprogramyearsService.getAll({
          select: [
            'vsi_name',
            '_vsi_participantid_value',
            'vsi_enrolmentstatus',
            'vsi_calculatedenfee',
            'vsi_previousyearcalculatedenfee',
            'vsi_taskstatus',
            'modifiedon',
          ],
          filter: "vsi_taskstatus eq 865520001",
          orderBy: ['modifiedon desc'],
          maxPageSize: 5000,
        });

        const queuesResult = await QueuesService.getAll({
          select: ['queueid', 'name'],
          filter: `name eq '${SUPERVISOR_QUEUE_NAME}' and statecode eq 0`,
          maxPageSize: 1,
        });

        const queueFallbackResult = (!queuesResult.success || (queuesResult.data?.length ?? 0) === 0)
          ? await QueuesService.getAll({
              select: ['queueid', 'name'],
              filter: "contains(name,'Supervisor') and contains(name,'Approval') and statecode eq 0",
              maxPageSize: 20,
            })
          : null;

        const supervisorQueues = (queuesResult.success && (queuesResult.data?.length ?? 0) > 0)
          ? (queuesResult.data ?? [])
          : (queueFallbackResult?.success ? (queueFallbackResult.data ?? []) : []);

        const supervisorQueueIdSet = new Set(
          supervisorQueues
            .map(q => normalizeGuid(q.queueid))
            .filter((id): id is string => !!id)
        );

        const queueitems: Array<NonNullable<Awaited<ReturnType<typeof QueueitemsService.getAll>>['data']>[number]> = [];
        let queueitemsSuccess = true;
        let queueitemsErrorMessage: string | undefined;
        let queueSkipToken: string | undefined;

        do {
          const queueitemsResult = await QueueitemsService.getAll({
            select: [
              'queueitemid',
              '_objectid_value',
              '_workerid_value',
              '_queueid_value',
              'enteredon',
              'workeridmodifiedon',
              'statecode',
            ],
            filter: 'statecode eq 0',
            maxPageSize: 5000,
            ...(queueSkipToken ? { skipToken: queueSkipToken } : {}),
          });

          if (!queueitemsResult.success) {
            queueitemsSuccess = false;
            queueitemsErrorMessage = queueitemsResult.error?.message ?? 'Unable to load queue work metadata.';
            break;
          }

          queueitems.push(...(queueitemsResult.data ?? []));
          queueSkipToken = queueitemsResult.skipToken;
        } while (queueSkipToken);

        const queueMap: Record<string, QueueWorkMeta> = {};
        if (queueitemsSuccess) {
          for (const q of queueitems) {
            const enrolmentId = normalizeGuid(q._objectid_value);
            if (!enrolmentId) continue;
            const isActive = q.statecode === 0;
            if (!isActive) continue;

            const queueDisplayName = (q as unknown as Record<string, unknown>)['_queueid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined;
            const queueId = normalizeGuid(q._queueid_value);
            const isSupervisorQueue =
              (queueId ? supervisorQueueIdSet.has(queueId) : false)
              || isSupervisorApprovalQueueName(queueDisplayName);
            if (!isSupervisorQueue) continue;

            const existing = queueMap[enrolmentId];
            if (existing) continue;

            const workerDisplayName = (q as unknown as Record<string, unknown>)['_workerid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined;
            queueMap[enrolmentId] = {
              workedBy: workerDisplayName ?? '—',
              workedOn: formatWorkedOn(q.workeridmodifiedon),
              workedOnRaw: q.workeridmodifiedon,
              enteredQueue: formatWorkedOn(q.enteredon),
              enteredQueueRaw: q.enteredon,
              workerId: q._workerid_value,
              queueitemId: q.queueitemid,
              queueId,
              queueName: queueDisplayName,
              isActive,
            };
          }
        }

        if (Object.keys(queueMap).length > 0) {
          Object.values(queueMap).forEach(meta => {
            if (meta.queueId) supervisorQueueIdSet.add(meta.queueId);
          });
        }

        if (!cancelled) {
          if (!result.success) {
            setItems([]);
            setError(result.error?.message ?? 'Unable to load supervisor approval items.');
          } else {
            const allowedEnrolmentIds = new Set(Object.keys(queueMap));
            setItems((result.data ?? []).filter(item => {
              const id = normalizeGuid(item.vsi_participantprogramyearid);
              return !!id && allowedEnrolmentIds.has(id);
            }));
          }

          setQueueWorkByEnrolmentId(queueMap);
          setSupervisorQueueIds(new Set(supervisorQueueIdSet));
          if (!queueitemsSuccess) {
            setError(queueitemsErrorMessage ?? 'Unable to load queue work metadata.');
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshCounter]);

  useEffect(() => {
    const workerIds = [...new Set(
      Object.values(queueWorkByEnrolmentId)
        .map(m => m.workerId)
        .filter((id): id is string => !!id)
    )];
    if (workerIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries: [string, string][] = [];
      for (const id of workerIds) {
        if (cancelled) break;
        const result = await Office365UsersService.UserPhoto_V2(id);
        if (!cancelled && result.success && result.data) {
          entries.push([id, result.data]);
        }
      }
      if (!cancelled && entries.length > 0) {
        setWorkerAvatarUrls(prev => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    })();
    return () => { cancelled = true; };
  }, [queueWorkByEnrolmentId]);

  // Per-row fallback: for items not resolved by the bulk fetch, query individually
  useEffect(() => {
    if (items.length === 0) return;
    if (supervisorQueueIds.size === 0) return;
    let cancelled = false;

    const missingIds = items
      .map(item => normalizeGuid(item.vsi_participantprogramyearid))
      .filter((id): id is string => !!id && !fetchedQueueIds.current.has(id));

    if (missingIds.length === 0) return;
    missingIds.forEach(id => fetchedQueueIds.current.add(id));

    (async () => {
      const updates: Record<string, QueueWorkMeta> = {};
      for (const enrolmentId of missingIds) {
        if (cancelled) break;
        const queueConstraint = [...supervisorQueueIds]
          .map(id => `_queueid_value eq '${id}'`)
          .join(' or ');
        const result = await QueueitemsService.getAll({
          select: ['queueitemid', '_objectid_value', '_workerid_value', '_queueid_value', 'enteredon', 'workeridmodifiedon'],
          filter: `objectid_vsi_participantprogramyear/vsi_participantprogramyearid eq '${enrolmentId}' and statecode eq 0 and (${queueConstraint})`,
          maxPageSize: 1,
        });
        if (!cancelled && result.success && (result.data?.length ?? 0) > 0) {
          const q = result.data![0];
          const workerDisplayName = (q as unknown as Record<string, unknown>)['_workerid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined;
          const queueDisplayName = (q as unknown as Record<string, unknown>)['_queueid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined;
          updates[enrolmentId] = {
            workedBy: workerDisplayName ?? '—',
            workedOn: formatWorkedOn(q.workeridmodifiedon),
            workedOnRaw: q.workeridmodifiedon,
            enteredQueue: formatWorkedOn(q.enteredon),
            enteredQueueRaw: q.enteredon,
            workerId: q._workerid_value,
            queueitemId: q.queueitemid,
            queueId: q._queueid_value,
            queueName: queueDisplayName,
            isActive: true,
          };
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setQueueWorkByEnrolmentId(prev => ({ ...prev, ...updates }));
      }
    })();

    return () => { cancelled = true; };
  }, [items, supervisorQueueIds]);

  const resolveCurrentUser = async (): Promise<{ systemUserId: string; displayName: string }> => {
    if (currentUser) return currentUser;

    const resolved = await resolveCurrentSystemUser();
    const nextUser = {
      systemUserId: resolved.systemUserId,
      displayName: resolved.displayName,
    };
    setCurrentUser(nextUser);
    return nextUser;
  };

  const canApproveRow = (row: SupervisorRowView): boolean => {
    const workerId = normalizeGuid(row.workMeta?.workerId);
    if (!workerId) return true;
    if (!currentUser?.systemUserId) return false;
    return workerId === normalizeGuid(currentUser.systemUserId);
  };

  const getApprovalOwnershipError = (rows: SupervisorRowView[]): string | null => {
    const blockedRows = rows.filter(row => !canApproveRow(row));
    if (blockedRows.length === 0) return null;

    if (blockedRows.length === 1) {
      return `${blockedRows[0].enrolmentName} is assigned to ${blockedRows[0].workedBy}. You can only approve items worked by you or with a blank Worked By value.`;
    }

    return 'Some selected enrolments are assigned to another worker. You can only approve items worked by you or with a blank Worked By value.';
  };

  const approvalBlockedTooltip = 'You cannot approve enrolments being worked on by another user.';
  const bulkApprovalBlockedTooltip = 'One or more selected approvals is being worked on by another user';

  const updateQueueItemWorker = async (queueItemId: string, systemUserId: string | null): Promise<void> => {
    const bindingValue = systemUserId ? `/systemusers(${systemUserId})` : null;

    let updateResult = await QueueitemsService.update(queueItemId, {
      'workerid_systemuser@odata.bind': bindingValue,
    } as unknown as Parameters<typeof QueueitemsService.update>[1]);

    if (!updateResult.success) {
      updateResult = await QueueitemsService.update(queueItemId, {
        'WorkerId@odata.bind': bindingValue,
      } as Parameters<typeof QueueitemsService.update>[1]);
    }

    if (!updateResult.success) {
      throw new Error(updateResult.error?.message ?? 'Failed to update queue item worker.');
    }
  };

  const handlePick = async (row: SupervisorRowView) => {
    if (!row.workMeta?.queueitemId || !row.itemId) return;
    setPickingRowId(row.itemId);
    setActionError(null);
    try {
      const user = await resolveCurrentUser();
      await updateQueueItemWorker(row.workMeta.queueitemId, user.systemUserId);
      setQueueWorkByEnrolmentId(prev => ({
        ...prev,
        [row.itemId!]: {
          ...prev[row.itemId!],
          workedBy: user.displayName,
          workedOn: new Date().toLocaleDateString(),
          workedOnRaw: new Date().toISOString(),
          workerId: user.systemUserId,
        },
      }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Pick failed');
    } finally {
      setPickingRowId(null);
    }
  };

  const handleRelease = async (row: SupervisorRowView) => {
    if (!row.workMeta?.queueitemId || !row.itemId) return;
    setReleasingRowId(row.itemId);
    setActionError(null);
    try {
      await updateQueueItemWorker(row.workMeta.queueitemId, null);

      setQueueWorkByEnrolmentId(prev => ({
        ...prev,
        [row.itemId!]: {
          ...prev[row.itemId!],
          workedBy: '—',
          workedOn: '—',
          workedOnRaw: undefined,
          workerId: undefined,
        },
      }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Release failed');
    } finally {
      setReleasingRowId(null);
    }
  };

  const removeApprovedRowsFromState = (rows: SupervisorRowView[]) => {
    const normalizedApproved = new Set(
      rows
        .map(r => normalizeGuid(r.itemId))
        .filter((id): id is string => !!id)
    );

    setItems(prev => prev.filter(item => !normalizedApproved.has(normalizeGuid(item.vsi_participantprogramyearid))));

    setQueueWorkByEnrolmentId(prev => {
      const next = { ...prev };
      for (const row of rows) {
        if (row.itemId) {
          delete next[row.itemId];
          delete next[normalizeGuid(row.itemId)];
        }
      }
      return next;
    });

    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const row of rows) {
        if (row.itemId) next.delete(row.itemId);
      }
      return next;
    });
  };

  const approveRows = async (rows: SupervisorRowView[]) => {
    const user = await resolveCurrentUser();
    const approvedDate = new Date().toISOString();

    for (const row of rows) {
      if (!row.itemId) continue;

      const enrolmentId = row.itemId;
      const statusUpdateResult = await Vsi_participantprogramyearsService.update(enrolmentId, {
        vsi_taskstatus: 865520003,
        vsi_taskstatusapproveddate: approvedDate,
        'vsi_TaskStatusApprover@odata.bind': `/systemusers(${user.systemUserId})`,
      });
      if (!statusUpdateResult.success) {
        throw new Error(statusUpdateResult.error?.message ?? `Failed to set Approved status for ${enrolmentId}.`);
      }

      if (row.workMeta?.queueitemId) {
        await QueueitemsService.delete(row.workMeta.queueitemId);
      }
    }

    removeApprovedRowsFromState(rows);
  };

  const handleApproveRow = async (row: SupervisorRowView) => {
    if (!row.itemId) return;
    setApprovingRowId(row.itemId);
    setActionError(null);
    try {
      const ownershipError = getApprovalOwnershipError([row]);
      if (ownershipError) throw new Error(ownershipError);
      await approveRows([row]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setApprovingRowId(null);
    }
  };

  const handleApproveSelected = async () => {
    if (selectedIds.size === 0) return;
    setApprovingBulk(true);
    setActionError(null);
    try {
      const rowsToApprove = allRows.filter(row => row.itemId != null && selectedIds.has(row.itemId));
      if (rowsToApprove.length === 0) return;
      const ownershipError = getApprovalOwnershipError(rowsToApprove);
      if (ownershipError) throw new Error(ownershipError);
      await approveRows(rowsToApprove);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Approve selected failed');
    } finally {
      setApprovingBulk(false);
    }
  };

  const onSort = (key: SupervisorColumnKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
  };

  const onColumnWidthChange = (key: SupervisorColumnKey) => (width: number | undefined) => {
    setColumnWidths(prev => ({ ...prev, [key]: width }));
  };

  const onColDragStart = (index: number) => {
    setColDragIdx(index);
  };

  const onColDragOver = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (colDragIdx === null || colDragIdx === index) return;

    setColumnOrder(prev => {
      const next = [...prev];
      const [moved] = next.splice(colDragIdx, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setColDragIdx(index);
  };

  const onColDragEnd = () => {
    setColDragIdx(null);
  };

  type SupervisorRowView = {
    item: Vsi_participantprogramyears;
    itemId: string | null;
    workMeta: QueueWorkMeta | undefined;
    enrolmentName: string;
    participantName: string;
    taskStatusLabel: string;
    enrolmentStatusLabel: string;
    calculatedFeeValue: number | null;
    enteredQueue: string;
    enteredQueueRaw?: string;
    workedBy: string;
    workedOn: string;
    workedOnRaw?: string;
  };

  const allRows = useMemo<SupervisorRowView[]>(() => {
    return items.map(item => {
      const itemId = getRowId(item);
      const workMeta = itemId ? queueWorkByEnrolmentId[itemId] : undefined;
      const rawItem = item as unknown as Record<string, unknown>;
      const participantDisplayName = (rawItem['_vsi_participantid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined)
        ?? item.vsi_participantidname
        ?? '—';
      return {
        item,
        itemId,
        workMeta,
        enrolmentName: item.vsi_name ?? '—',
        participantName: participantDisplayName,
        taskStatusLabel: getTaskStatusLabel(item.vsi_taskstatus) || 'Unknown',
        enrolmentStatusLabel: getEnrolmentStatusLabel(item.vsi_enrolmentstatus) || '—',
        calculatedFeeValue: item.vsi_calculatedenfee ?? null,
        enteredQueue: workMeta?.enteredQueue ?? '—',
        enteredQueueRaw: workMeta?.enteredQueueRaw,
        workedBy: workMeta?.workedBy ?? '—',
        workedOn: workMeta?.workedOn ?? '—',
        workedOnRaw: workMeta?.workedOnRaw,
      };
    });
  }, [items, queueWorkByEnrolmentId]);

  const filterValue = (row: SupervisorRowView, key: SupervisorColumnKey): string => {
    switch (key) {
      case 'enrolmentName':
        return row.enrolmentName;
      case 'participant':
        return row.participantName;
      case 'taskStatus':
        return row.taskStatusLabel;
      case 'enrolmentStatus':
        return row.enrolmentStatusLabel;
      case 'calculatedFee':
        return formatCurrencyOr(row.calculatedFeeValue, '—');
      case 'enteredQueue':
        return row.enteredQueue;
      case 'workedBy':
        return row.workedBy;
      case 'workedOn':
        return row.workedOn;
      default:
        return '—';
    }
  };

  const filterOptionsByColumn = useMemo<Record<SupervisorColumnKey, string[]>>(() => {
    const buckets: Record<SupervisorColumnKey, Set<string>> = {
      enrolmentName: new Set(),
      participant: new Set(),
      taskStatus: new Set(),
      enrolmentStatus: new Set(),
      calculatedFee: new Set(),
      enteredQueue: new Set(),
      workedBy: new Set(),
      workedOn: new Set(),
    };

    for (const row of allRows) {
      (Object.keys(buckets) as SupervisorColumnKey[]).forEach(key => {
        buckets[key].add(filterValue(row, key));
      });
    }

    return {
      enrolmentName: [...buckets.enrolmentName].sort((a, b) => a.localeCompare(b)),
      participant: [...buckets.participant].sort((a, b) => a.localeCompare(b)),
      taskStatus: [...buckets.taskStatus].sort((a, b) => a.localeCompare(b)),
      enrolmentStatus: ENROLMENT_STATUS_FILTER_OPTIONS,
      calculatedFee: [...buckets.calculatedFee].sort((a, b) => a.localeCompare(b)),
      enteredQueue: [...buckets.enteredQueue].sort((a, b) => a.localeCompare(b)),
      workedBy: [...buckets.workedBy].sort((a, b) => a.localeCompare(b)),
      workedOn: [...buckets.workedOn].sort((a, b) => a.localeCompare(b)),
    };
  }, [allRows]);

  const filteredAndSortedRows = useMemo(() => {
    const filtered = allRows.filter(row => {
      for (const key of Object.keys(columnFilters) as SupervisorColumnKey[]) {
        const selected = columnFilters[key];
        if (selected.size === 0) continue;
        const value = filterValue(row, key);
        const hasValue = selected.has(value);
        const pass = columnFilterOps[key] === 'equals' ? hasValue : !hasValue;
        if (!pass) return false;
      }
      return true;
    });

    if (!sortKey) return filtered;

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'calculatedFee': {
          const av = a.calculatedFeeValue ?? Number.NEGATIVE_INFINITY;
          const bv = b.calculatedFeeValue ?? Number.NEGATIVE_INFINITY;
          cmp = av - bv;
          break;
        }
        case 'workedOn': {
          const at = a.workedOnRaw ? new Date(a.workedOnRaw).getTime() : Number.NEGATIVE_INFINITY;
          const bt = b.workedOnRaw ? new Date(b.workedOnRaw).getTime() : Number.NEGATIVE_INFINITY;
          cmp = at - bt;
          break;
        }
        case 'enteredQueue': {
          const at = a.enteredQueueRaw ? new Date(a.enteredQueueRaw).getTime() : Number.NEGATIVE_INFINITY;
          const bt = b.enteredQueueRaw ? new Date(b.enteredQueueRaw).getTime() : Number.NEGATIVE_INFINITY;
          cmp = at - bt;
          break;
        }
        case 'enrolmentName':
          cmp = a.enrolmentName.localeCompare(b.enrolmentName);
          break;
        case 'participant':
          cmp = a.participantName.localeCompare(b.participantName);
          break;
        case 'taskStatus':
          cmp = a.taskStatusLabel.localeCompare(b.taskStatusLabel);
          break;
        case 'enrolmentStatus':
          cmp = a.enrolmentStatusLabel.localeCompare(b.enrolmentStatusLabel);
          break;
        case 'workedBy':
          cmp = a.workedBy.localeCompare(b.workedBy);
          break;
        default:
          cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [allRows, columnFilterOps, columnFilters, sortDir, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRows.length / PAGE_SIZE));
  const pageRows = filteredAndSortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(prev => Math.min(prev, totalPages));
  }, [totalPages]);

  const allSelected =
    pageRows.length > 0 && pageRows.every(row => {
      return row.itemId != null && selectedIds.has(row.itemId);
    });

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        pageRows.forEach(row => {
          const itemId = row.itemId;
          if (itemId != null) next.delete(itemId);
        });
      } else {
        pageRows.forEach(row => {
          const itemId = row.itemId;
          if (itemId != null) next.add(itemId);
        });
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedCount = selectedIds.size;
  const selectedRows = allRows.filter(row => row.itemId != null && selectedIds.has(row.itemId));
  const hasBlockedSelectedRows = selectedRows.some(row => !canApproveRow(row));

  return (
    <div className="sa-wrapper">
      <div>
        <h1 className="sa-page-title">Supervisor&rsquo;s Approval Queue</h1>
        <p className="sa-page-subtitle">
          Review and manage pending approval items, update task statuses, and ensure timely processing.
        </p>
      </div>

      <div className="sa-filters-bar">
        <button type="button" className="sa-filter-btn">
          <Filter size={14} />
          Filters
        </button>
        <button
          type="button"
          className="sa-filter-btn"
          disabled={loading}
          onClick={() => setRefreshCounter(prev => prev + 1)}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="sa-card">
        <div className="sa-card-header">
          <div className="sa-card-title-block">
            <h2 className="sa-card-title">Pending Reviews</h2>
            <p className="sa-card-subtitle">Items requiring your attention, referred by admin(s)</p>
          </div>
          <div className="sa-bulk-actions">
            <button type="button" className="sa-btn-secondary">Bulk Actions</button>
            <span title={hasBlockedSelectedRows ? bulkApprovalBlockedTooltip : undefined}>
              <button
                type="button"
                className="sa-btn-primary"
                disabled={selectedCount === 0 || approvingBulk || hasBlockedSelectedRows}
                onClick={() => void handleApproveSelected()}
              >
                {approvingBulk
                  ? 'Approving...'
                  : `Approve Selected${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </button>
            </span>
          </div>
        </div>

        <div className="sa-table-container">
          {loading && <p className="sa-state-msg loading">Loading queue items…</p>}
          {error && <p className="sa-state-msg error">Error: {error}</p>}
          {actionError && (
            <p className="sa-state-msg error" style={{ cursor: 'pointer' }} onClick={() => setActionError(null)}>
              Action failed: {actionError} &times;
            </p>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="sa-state-msg empty">No pending items in the supervisor approval queue.</p>
          )}
          {!loading && !error && items.length > 0 && (
            <table className="sa-table">
              <thead>
                <tr>
                  <th className="sa-th-check">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  {columnOrder.map((key, index) => {
                    const colDef = SUPERVISOR_COLUMNS.find(c => c.key === key)!;
                    return (
                      <ColumnHeaderMenu
                        key={key}
                        label={colDef.label}
                        sortKey={key}
                        currentSortKey={sortKey}
                        currentSortDir={sortDir}
                        onSort={(k, dir) => onSort(k as SupervisorColumnKey, dir)}
                        columnWidth={columnWidths[key]}
                        onColumnWidthChange={onColumnWidthChange(key)}
                        filterOptions={filterOptionsByColumn[key]}
                        selectedFilters={columnFilters[key]}
                        filterOperator={columnFilterOps[key]}
                        onFilterChange={next => setColumnFilters(prev => ({ ...prev, [key]: new Set(next) }))}
                        onFilterOperatorChange={op => setColumnFilterOps(prev => ({ ...prev, [key]: op }))}
                        dragProps={{
                          draggable: true,
                          onDragStart: () => onColDragStart(index),
                          onDragOver: (event: DragEvent) => onColDragOver(event, index),
                          onDragEnd: onColDragEnd,
                          className: colDragIdx === index ? 'col-dragging' : undefined,
                        }}
                      />
                    );
                  })}
                  <th className="sa-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, index) => {
                  const item = row.item;
                  const itemId = row.itemId;
                  const hasCalculatedFee = item.vsi_calculatedenfee != null;
                  const variance = calculateVariance(item.vsi_calculatedenfee, item.vsi_previousyearcalculatedenfee);
                  const workMeta = row.workMeta;

                  return (
                    <tr key={itemId ?? `${item.vsi_name ?? 'row'}-${index}`}>
                      <td className="sa-td-check">
                        <input
                          type="checkbox"
                          checked={itemId != null && selectedIds.has(itemId)}
                          onChange={() => {
                            if (itemId != null) toggleSelect(itemId);
                          }}
                          aria-label={`Select ${item.vsi_name ?? itemId ?? 'row'}`}
                          disabled={itemId == null}
                        />
                      </td>
                      {columnOrder.map(key => {
                        if (key === 'enrolmentName') {
                          return <td key={key} className="sa-pin">{item.vsi_name ?? '—'}</td>;
                        }
                        if (key === 'participant') {
                          return <td key={key}>{row.participantName}</td>;
                        }
                        if (key === 'taskStatus') {
                          return (
                            <td key={key}>
                              <StatusBadge status={item.vsi_taskstatus} />
                            </td>
                          );
                        }
                        if (key === 'enrolmentStatus') {
                          const statusLabel = getEnrolmentStatusLabel(item.vsi_enrolmentstatus);
                          return (
                            <td key={key}>
                              <span className={`enrol-badge ${enrolmentStatusClass(statusLabel)}`}>{statusLabel || '—'}</span>
                            </td>
                          );
                        }
                        if (key === 'calculatedFee') {
                          return (
                            <td key={key}>
                              <span className="sa-fee-cell">
                                {itemId && hasCalculatedFee
                                  ? <Link className="sa-fee-amount sa-fee-link" to={`/calculation/${itemId}`}>{formatCurrencyOr(item.vsi_calculatedenfee, '—')}</Link>
                                  : <span className="sa-fee-amount">{formatCurrencyOr(item.vsi_calculatedenfee, '—')}</span>}
                                {variance != null ? <VariancePill variance={variance} /> : null}
                              </span>
                            </td>
                          );
                        }
                        if (key === 'enteredQueue') {
                          return <td key={key}>{workMeta?.enteredQueue ?? '—'}</td>;
                        }
                        if (key === 'workedBy') {
                          return (
                            <td key={key} className="sa-worked-by-cell">
                              {!workMeta || workMeta.workedBy === '—'
                                ? '—'
                                : (
                                  <span className="sa-worked-by-content">
                                    {workMeta.workerId && workerAvatarUrls[workMeta.workerId]
                                      ? <img className="avatar-circle" src={`data:image/jpeg;base64,${workerAvatarUrls[workMeta.workerId]}`} alt={workMeta.workedBy} title={workMeta.workedBy} />
                                      : <span className="avatar-circle" title={workMeta.workedBy}>{getInitials(workMeta.workedBy)}</span>}
                                    <span className="sa-worked-by-name">{workMeta.workedBy}</span>
                                  </span>
                                )}
                            </td>
                          );
                        }
                        return <td key={key}>{workMeta?.workedOn ?? '—'}</td>;
                      })}
                      <td className="sa-td-actions">
                        <div className="sa-row-actions">
                          <button
                            type="button"
                            className="sa-action-btn"
                            disabled={!itemId || !workMeta?.queueitemId || pickingRowId === itemId}
                            onClick={() => void handlePick(row)}
                          >{pickingRowId === itemId ? '…' : 'Pick'}</button>
                          <button
                            type="button"
                            className="sa-action-btn"
                            disabled={!itemId || !workMeta?.queueitemId || releasingRowId === itemId}
                            onClick={() => void handleRelease(row)}
                          >{releasingRowId === itemId ? '…' : 'Release'}</button>
                          <button
                          type="button"
                          className="sa-action-btn"
                          disabled={!itemId}
                          onClick={() => {
                            if (itemId) setAssignTarget({
                              enrolmentId: itemId,
                              enrolmentName: item.vsi_name ?? '—',
                              queueitemId: workMeta?.queueitemId,
                              queueId: workMeta?.queueId,
                              queueName: workMeta?.queueName,
                            });
                          }}
                        >Assign</button>
                          {itemId
                            ? <Link className="sa-action-btn sa-action-link" to={`/calculation/${itemId}`}>Go to calculation</Link>
                            : <button type="button" className="sa-action-btn" disabled>Go to calculation</button>}
                          <span title={!canApproveRow(row) ? approvalBlockedTooltip : undefined}>
                            <button
                              type="button"
                              className="sa-action-btn sa-action-ready"
                              disabled={!itemId || approvingRowId === itemId || !canApproveRow(row)}
                              onClick={() => void handleApproveRow(row)}
                            >
                              {approvingRowId === itemId ? '...' : 'Approve'}
                            </button>
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!loading && !error && items.length > 0 && filteredAndSortedRows.length === 0 && (
            <p className="sa-state-msg empty">No records match the current filters.</p>
          )}
        </div>

        {!loading && !error && items.length > 0 && (
          <div className="sa-pagination">
            <span>
              {filteredAndSortedRows.length === 0
                ? 'Showing 0 of 0 results'
                : `Showing ${Math.min((page - 1) * PAGE_SIZE + 1, filteredAndSortedRows.length)}–${Math.min(page * PAGE_SIZE, filteredAndSortedRows.length)} of ${filteredAndSortedRows.length} result${filteredAndSortedRows.length !== 1 ? 's' : ''}`}
            </span>
            <div className="sa-pagination-controls">
              <button
                type="button"
                className="sa-page-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                &lsaquo; Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  type="button"
                  className={`sa-page-btn${p === page ? ' active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="sa-page-btn"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next &rsaquo;
              </button>
            </div>
          </div>
        )}
      </div>

      {assignTarget && (
        <AssignWorkerModal
          enrolmentName={assignTarget.enrolmentName}
          queueitemId={assignTarget.queueitemId}
          queueId={assignTarget.queueId}
          queueName={assignTarget.queueName}
          onClose={() => setAssignTarget(null)}
          onAssigned={(workerId, workerName) => {
            setQueueWorkByEnrolmentId(prev => ({
              ...prev,
              [assignTarget.enrolmentId]: {
                ...prev[assignTarget.enrolmentId],
                workedBy: workerName,
                workedOn: new Date().toLocaleDateString(),
                workerId,
              },
            }));
            setAssignTarget(null);
          }}
        />
      )}
    </div>
  );
}

