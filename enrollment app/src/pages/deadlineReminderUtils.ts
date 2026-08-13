export type ReminderKind = 'nonPenalty' | 'finalDeadline' | 'lateFinalDeadline';

const EN_STATUS_ENROLMENT_NOTICE_SENT = 865520007;
const EN_STATUS_ENROLLED_NOT_PAID = 865520008;

export type ReminderWindowCandidate = {
  remainingDays: number | null;
  reminderSent?: boolean | null;
};

export const buildDeadlineReminderEligibilityClause = (): string =>
  `((vsi_enrolmentstatus eq 865520007 and ((vsi_lateenrolmentnoticesentdate ne null and vsi_latefinaldeadlinedaysdiff ne null) or (vsi_lateenrolmentnoticesentdate eq null and vsi_enrolmentnoticesentdate ne null and vsi_nonpenaltydeadlinedaysleft ne null))) or (vsi_enrolmentstatus eq 865520008 and ((vsi_lateenrolmentnoticesentdate ne null and vsi_latefinaldeadlinedaysdiff ne null) or (vsi_lateenrolmentnoticesentdate eq null and vsi_enrolmentnoticesentdate ne null and vsi_finaldeadlinedaysdiff ne null))))`;

export const shouldIncludeReminderRow = ({ remainingDays, reminderSent }: ReminderWindowCandidate): boolean =>
  !(remainingDays === 0 && reminderSent === false);

export const resolveReminderKind = (
  status: number,
  hasLateNoticeSentDate: boolean,
): ReminderKind | null => {
  if (hasLateNoticeSentDate && (
    status === EN_STATUS_ENROLLED_NOT_PAID
    || status === EN_STATUS_ENROLMENT_NOTICE_SENT
  )) {
    return 'lateFinalDeadline';
  }
  if (status === EN_STATUS_ENROLLED_NOT_PAID) return 'finalDeadline';
  if (status === EN_STATUS_ENROLMENT_NOTICE_SENT) return 'nonPenalty';
  return null;
};

export const getReminderRemainingDays = (
  kind: ReminderKind,
  nonPenaltyDaysLeft: number | null | undefined,
  finalDeadlineDaysDiff: number | null | undefined,
  lateFinalDeadlineDaysDiff: number | null | undefined,
): number | null => {
  const remainingDays = kind === 'nonPenalty'
    ? nonPenaltyDaysLeft
    : kind === 'finalDeadline'
      ? finalDeadlineDaysDiff
      : lateFinalDeadlineDaysDiff;
  return remainingDays ?? null;
};

export const hasEnrolmentNoticeSentDate = (value: string | null | undefined): boolean =>
  value != null && value.trim().length > 0;

export const isDueWithinFiveDays = ({ remainingDays }: ReminderWindowCandidate): boolean =>
  remainingDays != null && remainingDays >= 1 && remainingDays <= 5;