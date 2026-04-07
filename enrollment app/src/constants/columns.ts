import type { ColumnDef, SortKey, ViewPayload } from '../types/enrollment';

export const ALL_COLUMNS: ColumnDef[] = [
  { key: 'pin', label: 'Enrolment Name', icon: '🔤', removable: false },
  { key: 'producer', label: 'Participant', icon: '🔗', removable: true },
  { key: 'year', label: 'Year', icon: '🔗', removable: true },
  { key: 'enrolStatus', label: 'Enrolment Status', icon: '📋', removable: true },
  { key: 'taskStatus', label: 'Task Status', icon: '📋', removable: true },
  { key: 'fee', label: 'Calculated fee', icon: '🔢', removable: true },
  { key: 'totalFeesOwed', label: 'Total Fees Owed', icon: '🔢', removable: true },
  { key: 'totalFeesPaid', label: 'Total Fees Paid', icon: '🔢', removable: true },
  { key: 'enrolmentFee', label: 'Enrolment Fee', icon: '🔢', removable: true },
  { key: 'latePay', label: 'Late Payment Fee', icon: '🔢', removable: true },
  { key: 'sharepoint', label: 'SharePoint', icon: '🔗', removable: true },
  { key: 'modifiedBy', label: 'Modified by', icon: '👤', removable: true },
  { key: 'modifiedOn', label: 'Modified on', icon: '📅', removable: true },
  { key: 'regionalOffice', label: 'Regional Office', icon: '📋', removable: true },
  { key: 'farmingSector', label: 'Farming Sector', icon: '📋', removable: true },
  { key: 'bringForward', label: 'Bring Forward', icon: '☑', removable: true },
  { key: 'broughtForward', label: 'Brought Forward', icon: '☑', removable: true },
  { key: 'hasPartners', label: 'Has Partners', icon: '☑', removable: true },
  { key: 'inCombinedFarm', label: 'In Combined Farm', icon: '☑', removable: true },
  { key: 'manualReview', label: 'Manual Review', icon: '☑', removable: true },
  { key: 'enrolNoticeDate', label: 'EN Notice Sent Date', icon: '📅', removable: true },
  { key: 'fileReceivedDate', label: 'File Received Date', icon: '📅', removable: true },
  { key: 'feesPaidDate', label: 'Fees Paid Date', icon: '📅', removable: true },
];

export const DEFAULT_VISIBLE_KEYS: SortKey[] = [
  'pin', 'producer', 'year', 'taskStatus', 'enrolStatus', 'fee', 'sharepoint', 'modifiedBy',
];

export const SORTKEY_TO_FIELD: Record<SortKey, string> = {
  pin: 'vsi_name',
  producer: 'vsi_participantid',
  year: 'vsi_programyearid',
  taskStatus: 'vsi_taskstatus',
  enrolStatus: 'vsi_enrolmentstatus',
  fee: 'vsi_calculatedenfee',
  totalFeesOwed: 'vsi_totalfeesowed',
  totalFeesPaid: 'vsi_totalfeespaid',
  enrolmentFee: 'vsi_enrolmentfee',
  latePay: 'vsi_latepaymentfee',
  sharepoint: 'vsi_sharepointdocumentfolder',
  modifiedBy: 'modifiedby',
  modifiedOn: 'modifiedon',
  regionalOffice: 'vsi_enrollmentregionaloffice',
  farmingSector: 'vsi_farmingsector',
  bringForward: 'vsi_bringforward',
  broughtForward: 'vsi_broughtforward',
  hasPartners: 'vsi_haspartners',
  inCombinedFarm: 'vsi_incombinedfarm',
  manualReview: 'vsi_manualreview',
  enrolNoticeDate: 'vsi_enrolmentnoticesentdate',
  fileReceivedDate: 'vsi_filereceiveddate',
  feesPaidDate: 'vsi_enrolmentfeespaiddate',
};

export const FIELD_TO_SORTKEY: Record<string, SortKey> = Object.fromEntries(
  Object.entries(SORTKEY_TO_FIELD).map(([k, v]) => [v, k as SortKey])
) as Record<string, SortKey>;

export const ACTIVE_VIEW_KEY = 'enrolments-active-view';
export const USERQUERY_ENTITY = 'vsi_participantprogramyear';
export const USERQUERY_TYPE = 0;

export const DEFAULT_VIEW_SNAPSHOT: ViewPayload = {
  visibleColumnKeys: [...DEFAULT_VISIBLE_KEYS],
  columnWidths: {},
  sortKey: null,
  sortDir: 'asc',
  filters: { verifiedCalc: false, unverifiedCalc: false, flagged: false, partnerships: false },
  taskStatusFilter: [],
  enrolStatusFilter: [],
  taskFilterOp: 'equals',
  enrolFilterOp: 'equals',
  advFilterNodes: [],
  advLogicOp: 'AND',
};

export const ADV_FIELD_LABELS: Record<string, string> = {
  taskStatus: 'Task Status',
  enrolStatus: 'Enrol Status',
  pin: 'PIN',
  producer: 'Producer name',
  fee: 'Calculated fee',
};

export const ADV_FIELD_OPTIONS: Record<string, 'choice' | 'text'> = {
  taskStatus: 'choice',
  enrolStatus: 'choice',
  pin: 'text',
  producer: 'text',
  fee: 'text',
};

export const ADV_OP_LABELS: Record<string, string> = {
  equals: 'Equals',
  notEquals: 'Does not equal',
  contains: 'Contains',
  notContains: 'Does not contain',
  beginsWith: 'Begins with',
  endsWith: 'Ends with',
};
