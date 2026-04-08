import type { Vsi_participantprogramyears } from "../generated/models/Vsi_participantprogramyearsModel";

export type SortDir = 'asc' | 'desc';

export type SortKey =
  | 'pin' | 'producer' | 'year' | 'taskStatus' | 'enrolStatus' | 'fee'
  | 'modifiedBy' | 'sharepoint' | 'totalFeesOwed' | 'totalFeesPaid'
  | 'enrolmentFee' | 'latePay' | 'regionalOffice' | 'farmingSector'
  | 'bringForward' | 'broughtForward' | 'hasPartners' | 'inCombinedFarm'
  | 'manualReview' | 'enrolNoticeDate' | 'fileReceivedDate' | 'feesPaidDate'
  | 'modifiedOn';

export type ColumnIcon = '🔤' | '🔢' | '📋' | '🔗' | '👤' | '☑' | '📅';

export interface ColumnDef {
  key: SortKey;
  label: string;
  icon: ColumnIcon;
  removable: boolean;
}

export type FilterOperator = 'equals' | 'notEquals';

export type AdvFilterField = 'taskStatus' | 'enrolStatus' | 'pin' | 'producer' | 'fee';
export type AdvFilterOp = 'equals' | 'notEquals' | 'contains' | 'notContains' | 'beginsWith' | 'endsWith';
export type LogicOp = 'AND' | 'OR';

export interface AdvFilterRow {
  kind: 'row';
  id: number;
  field: AdvFilterField;
  operator: AdvFilterOp;
  values: Set<string>;
  textValue: string;
}

export interface AdvFilterGroup {
  kind: 'group';
  id: number;
  logic: LogicOp;
  children: AdvFilterNode[];
}

export type AdvFilterNode = AdvFilterRow | AdvFilterGroup;

export interface ViewPayload {
  visibleColumnKeys: SortKey[];
  columnWidths: Partial<Record<SortKey, number>>;
  sortKey: SortKey | null;
  sortDir: SortDir;
  filters: { verifiedCalc: boolean; unverifiedCalc: boolean; flagged: boolean; partnerships: boolean };
  taskStatusFilter: string[];
  enrolStatusFilter: string[];
  taskFilterOp: FilterOperator;
  enrolFilterOp: FilterOperator;
  advFilterNodes: unknown[];
  advLogicOp: LogicOp;
}

export type ViewSource = 'personal' | 'system';

export interface PersonalView extends ViewPayload {
  id: string;
  name: string;
  source: ViewSource;
}

export type EnrolmentRow = Vsi_participantprogramyears;

// Legacy compatibility types for old dashboard modules still present in src/
export type SortDirection = SortDir;
export type SortColumn =
  | 'pin'
  | 'producerName'
  | 'year'
  | 'taskStatus'
  | 'enrolStatus'
  | 'calculatedFee'
  | 'sharepoint'
  | 'modifiedOn';

export interface EnrollmentFilterState {
  verifiedCalculated: boolean;
  unverifiedCalculated: boolean;
  flaggedFiles: boolean;
  partnershipsCombined: boolean;
}

export interface EnrollmentRecord {
  id: string;
  pin: string;
  producerName: string;
  year: string;
  taskStatus: string;
  enrolStatus: string;
  calculatedFee: number | null;
  previousYearCalculatedFee: number | null;
  sharepointUrl: string;
  modifiedOn: string;
  flags: EnrollmentFilterState;
}
