import { QueueitemsService } from '../generated/services/QueueitemsService';
import { QueuesService } from '../generated/services/QueuesService';
import { Vsi_automaticemailauditsService } from '../generated/services/Vsi_automaticemailauditsService';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import {
  buildDeadlineReminderEligibilityClause,
  getReminderRemainingDays,
  hasEnrolmentNoticeSentDate,
  resolveReminderKind,
  shouldIncludeReminderRow,
} from '../pages/deadlineReminderUtils';

const COUNT_PAGE_SIZE = 5000;
const SUPERVISOR_QUEUE_NAME = 'Supervisor Approval Queue';
const SUPERVISOR_TASK_STATUS = 865520001;
const AUTOMATIC_EMAIL_SENDSTATUS_SENT = 865520001;
const AUTOMATIC_EMAIL_TYPE_NON_PENALTY = 865520001;
const AUTOMATIC_EMAIL_TYPE_FINAL_DEADLINE = 865520002;
const AUTOMATIC_EMAIL_TYPE_LATE_ENROLMENT = 865520007;

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

export async function countDeadlineReminders(): Promise<number> {
  const enrolmentFilter = buildDeadlineReminderEligibilityClause();

  const enrolmentRows = [] as NonNullable<Awaited<ReturnType<typeof Vsi_participantprogramyearsService.getAll>>['data']>;
  let enrolmentSkipToken: string | undefined;
  do {
    const enrolments = await Vsi_participantprogramyearsService.getAll({
      select: [
        'vsi_participantprogramyearid',
        'vsi_enrolmentstatus',
        'vsi_lateenrolmentnoticesentdate',
        'vsi_nonpenaltydeadlinedaysleft',
        'vsi_finaldeadlinedaysdiff',
        'vsi_latefinaldeadlinedaysdiff',
      ],
      filter: enrolmentFilter,
      maxPageSize: COUNT_PAGE_SIZE,
      ...(enrolmentSkipToken ? { skipToken: enrolmentSkipToken } : {}),
    });

    if (!enrolments.success) {
      throw new Error(enrolments.error?.message ?? 'Unable to count deadline reminders.');
    }

    enrolmentRows.push(...(enrolments.data ?? []));
    enrolmentSkipToken = enrolments.skipToken;
  } while (enrolmentSkipToken);

  const auditRows = [] as NonNullable<Awaited<ReturnType<typeof Vsi_automaticemailauditsService.getAll>>['data']>;
  let auditSkipToken: string | undefined;
  do {
    const audits = await Vsi_automaticemailauditsService.getAll({
      select: ['vsi_objectid', 'vsi_emailtype', 'vsi_sendstatus'],
      filter: `vsi_sendstatus eq ${AUTOMATIC_EMAIL_SENDSTATUS_SENT} and (vsi_emailtype eq ${AUTOMATIC_EMAIL_TYPE_NON_PENALTY} or vsi_emailtype eq ${AUTOMATIC_EMAIL_TYPE_FINAL_DEADLINE} or vsi_emailtype eq ${AUTOMATIC_EMAIL_TYPE_LATE_ENROLMENT})`,
      maxPageSize: COUNT_PAGE_SIZE,
      ...(auditSkipToken ? { skipToken: auditSkipToken } : {}),
    });

    if (!audits.success) {
      throw new Error(audits.error?.message ?? 'Unable to count deadline reminders.');
    }

    auditRows.push(...(audits.data ?? []));
    auditSkipToken = audits.skipToken;
  } while (auditSkipToken);

  const auditMap = new Map<string, { nonPenalty: boolean; finalDeadline: boolean; lateFinalDeadline: boolean }>();
  for (const audit of auditRows) {
    const id = normalizeGuid(audit.vsi_objectid);
    if (!id) continue;
    if (!auditMap.has(id)) {
      auditMap.set(id, { nonPenalty: false, finalDeadline: false, lateFinalDeadline: false });
    }
    const entry = auditMap.get(id)!;
    const emailType = Number(audit.vsi_emailtype);
    if (emailType === AUTOMATIC_EMAIL_TYPE_NON_PENALTY) entry.nonPenalty = true;
    if (emailType === AUTOMATIC_EMAIL_TYPE_FINAL_DEADLINE) entry.finalDeadline = true;
    if (emailType === AUTOMATIC_EMAIL_TYPE_LATE_ENROLMENT) entry.lateFinalDeadline = true;
  }

  let total = 0;
  for (const item of enrolmentRows) {
    const itemId = normalizeGuid(item.vsi_participantprogramyearid);
    if (!itemId) continue;

    const kind = resolveReminderKind(
      Number(item.vsi_enrolmentstatus),
      hasEnrolmentNoticeSentDate(item.vsi_lateenrolmentnoticesentdate),
    );
    if (kind == null) continue;

    const remainingDays = getReminderRemainingDays(
      kind,
      item.vsi_nonpenaltydeadlinedaysleft,
      item.vsi_finaldeadlinedaysdiff,
      item.vsi_latefinaldeadlinedaysdiff,
    );
    if (remainingDays == null) continue;

    const auditsForRow = auditMap.get(itemId);
    const reminderSent = kind === 'nonPenalty'
      ? (auditsForRow?.nonPenalty ?? false)
      : kind === 'finalDeadline'
        ? (auditsForRow?.finalDeadline ?? false)
        : (auditsForRow?.lateFinalDeadline ?? false);

    if (shouldIncludeReminderRow({ remainingDays, reminderSent })) {
      total += 1;
    }
  }

  return total;
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
