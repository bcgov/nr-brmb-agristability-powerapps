export const ENROLMENT_PRIMARY_KEY = 'vsi_participantprogramyearid';

export const ENROLMENT_PAGE_SIZE = 300;
export const MIN_ENROLMENT_SEARCH_LENGTH = 3;

export function normalizeEnrolmentSearchTerm(value: string): string {
  const normalized = value.trim();
  return normalized.length >= MIN_ENROLMENT_SEARCH_LENGTH ? normalized : '';
}

export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

export function buildEnrolmentDirectSearchFilter(value: string): string {
  const escaped = escapeODataString(value);
  return [
    `contains(vsi_name, '${escaped}')`,
    `contains(new_combinedfarmname, '${escaped}')`,
    `contains(vsi_partnershipnames, '${escaped}')`,
  ].join(' or ');
}

export const ENROLMENT_LIST_SELECT = [
  ENROLMENT_PRIMARY_KEY,
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
  'vsi_lateenrolmentnoticesentdate',
  'vsi_enrolmentfeesnonpenaltyduedate',
  'vsi_enrolmentfeesfinaldeadlinedate',
  'vsi_nonpenaltydeadlinedaysleft',
  'vsi_finaldeadlinedaysdiff',
  'vsi_latefinaldeadlinedaysdiff',
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
] as const;

const SORT_FIELDS = {
  pin: 'vsi_name',
  producer: '_vsi_participantid_value',
  year: '_vsi_programyearid_value',
  taskStatus: 'vsi_taskstatus',
  enrolStatus: 'vsi_enrolmentstatus',
  fee: 'vsi_totalfeesowedcalculated',
  totalFeesOwedCalculated: 'vsi_totalfeesowedcalculated',
  totalFeesPaid: 'vsi_totalfeespaid',
  enrolmentFee: 'vsi_enrolmentfee',
  latePay: 'vsi_latepaymentfee',
  sharepoint: 'vsi_sharepointdocumentfolder',
  owner: '_ownerid_value',
  modifiedOn: 'modifiedon',
  regionalOffice: 'vsi_enrollmentregionaloffice',
  farmingSector: 'vsi_farmingsector',
  bringForward: 'vsi_bringforward',
  broughtForward: 'vsi_broughtforward',
  hasPartners: 'vsi_haspartners',
  inCombinedFarm: 'vsi_incombinedfarm',
  manualReview: 'vsi_manualreview',
  enrolNoticeDate: 'vsi_enrolmentnoticesentdate',
  lateEnrolNoticeDate: 'vsi_lateenrolmentnoticesentdate',
  nonPenaltyDeadlineDaysLeft: 'vsi_nonpenaltydeadlinedaysleft',
  finalDeadlineDaysDiff: 'vsi_finaldeadlinedaysdiff',
  lateFinalDeadlineDaysDiff: 'vsi_latefinaldeadlinedaysdiff',
  enrolmentOptedOutDate: 'vsi_programyearoptoutdate',
  fileReceivedDate: 'vsi_filereceiveddate',
  feesPaidDate: 'vsi_enrolmentfeespaiddate',
  flagged: 'modifiedon',
  isNewParticipant: 'vsi_isnewparticipant',
  lateParticipant: 'vsi_fullyprovinciallyfunded',
} as const;

export type EnrolmentSortKey = keyof typeof SORT_FIELDS;
export type EnrolmentSortDirection = 'asc' | 'desc';

export function buildEnrolmentOrderBy(
  sortKey: EnrolmentSortKey | null,
  direction: EnrolmentSortDirection,
): string[] {
  const field = SORT_FIELDS[sortKey ?? 'modifiedOn'];
  return [`${field} ${direction}`, `${ENROLMENT_PRIMARY_KEY} asc`];
}

export interface EnrolmentGetAllOptions {
  maxPageSize: number;
  select: string[];
  filter: string;
  orderBy: string[];
  skipToken?: string;
}

export interface EnrolmentOperationResult<TRow> {
  success: boolean;
  data: TRow[];
  skipToken?: string;
  error?: { message?: string } | Error;
}

export interface FetchEnrolmentPageRequest {
  pageSize: number;
  filter: string;
  orderBy: string[];
  pageToken?: string;
}

export interface FetchEnrolmentPageResult<TRow> {
  rows: TRow[];
  nextPageToken?: string;
  hasNextPage: boolean;
}

export async function fetchEnrolmentPage<TRow>(
  getAll: (options: EnrolmentGetAllOptions) => Promise<EnrolmentOperationResult<TRow>>,
  request: FetchEnrolmentPageRequest,
): Promise<FetchEnrolmentPageResult<TRow>> {
  const options: EnrolmentGetAllOptions = {
    maxPageSize: request.pageSize,
    select: [...ENROLMENT_LIST_SELECT],
    filter: request.filter,
    orderBy: request.orderBy,
    ...(request.pageToken ? { skipToken: request.pageToken } : {}),
  };
  const result = await getAll(options);
  if (!result.success) {
    const message = result.error instanceof Error
      ? result.error.message
      : result.error?.message;
    throw new Error(message || 'Failed to load enrolments');
  }
  return {
    rows: result.data ?? [],
    nextPageToken: result.skipToken,
    hasNextPage: Boolean(result.skipToken),
  };
}
