import { QueueitemsService } from '../generated/services/QueueitemsService';
import { QueuesService } from '../generated/services/QueuesService';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';

const COUNT_PAGE_SIZE = 5000;
const SUPERVISOR_QUEUE_NAME = 'Supervisor Approval Queue';
const SUPERVISOR_TASK_STATUS = 865520001;
const ENROLMENT_NOTICE_SENT_STATUS = 865520007;
const ENROLLED_NOT_PAID_STATUS = 865520008;

const normalizeGuid = (value?: string | null) =>
  (value ?? '').replace(/[{}]/g, '').trim().toLowerCase();

async function countEnrolments(filter: string, allowedIds?: Set<string>): Promise<number> {
  let total = 0;
  let skipToken: string | undefined;
  do {
    const result = await Vsi_participantprogramyearsService.getAll({
      select: ['vsi_participantprogramyearid'],
      filter,
      maxPageSize: COUNT_PAGE_SIZE,
      ...(skipToken ? { skipToken } : {}),
    });
    if (!result.success) throw new Error(result.error?.message ?? 'Unable to count enrolments.');
    if (allowedIds) {
      total += (result.data ?? []).filter(item => {
        const id = normalizeGuid(item.vsi_participantprogramyearid);
        return !!id && allowedIds.has(id);
      }).length;
    } else {
      total += (result.data ?? []).length;
    }
    skipToken = result.skipToken;
  } while (skipToken);
  return total;
}

export function countNewParticipants(recentProgramYearFilter: string): Promise<number> {
  return countEnrolments(`(${recentProgramYearFilter}) and vsi_isnewparticipant eq true`);
}

export function countVerifierSupervisorTasks(recentProgramYearFilter: string): Promise<number> {
  return countEnrolments(`(${recentProgramYearFilter}) and vsi_taskstatus eq ${SUPERVISOR_TASK_STATUS}`);
}

export function countDeadlineReminders(): Promise<number> {
  return countEnrolments(
    `vsi_enrolmentstatus eq ${ENROLMENT_NOTICE_SENT_STATUS} or vsi_enrolmentstatus eq ${ENROLLED_NOT_PAID_STATUS}`,
  );
}

export async function countSupervisorApprovalQueue(): Promise<number> {
  const exactResult = await QueuesService.getAll({
    select: ['queueid', 'name'],
    filter: `name eq '${SUPERVISOR_QUEUE_NAME}' and statecode eq 0`,
    maxPageSize: 1,
  });
  const fallbackResult = (!exactResult.success || (exactResult.data?.length ?? 0) === 0)
    ? await QueuesService.getAll({
        select: ['queueid', 'name'],
        filter: "contains(name,'Supervisor') and contains(name,'Approval') and statecode eq 0",
        maxPageSize: 20,
      })
    : null;
  const queues = exactResult.success && (exactResult.data?.length ?? 0) > 0
    ? (exactResult.data ?? [])
    : (fallbackResult?.success ? (fallbackResult.data ?? []) : []);
  const queueIds = [...new Set(
    queues.map(queue => normalizeGuid(queue.queueid)).filter(Boolean),
  )];
  if (queueIds.length === 0) return 0;

  const activeEnrolmentIds = new Set<string>();
  let skipToken: string | undefined;
  const queueClause = queueIds.map(id => `_queueid_value eq '${id}'`).join(' or ');
  do {
    const result = await QueueitemsService.getAll({
      select: ['_objectid_value'],
      filter: `statecode eq 0 and (${queueClause})`,
      maxPageSize: COUNT_PAGE_SIZE,
      ...(skipToken ? { skipToken } : {}),
    });
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Unable to count supervisor queue items.');
    }
    for (const item of result.data ?? []) {
      const enrolmentId = normalizeGuid(item._objectid_value);
      if (enrolmentId) activeEnrolmentIds.add(enrolmentId);
    }
    skipToken = result.skipToken;
  } while (skipToken);

  if (activeEnrolmentIds.size === 0) return 0;
  return countEnrolments(
    `vsi_taskstatus eq ${SUPERVISOR_TASK_STATUS}`,
    activeEnrolmentIds,
  );
}
