export type SortDirection = "asc" | "desc";

export type SortColumn =
  | "pin"
  | "producerName"
  | "year"
  | "taskStatus"
  | "enrolStatus"
  | "calculatedFee"
  | "sharepoint"
  | "modifiedOn";

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
  sharepointUrl: string;
  modifiedOn: string;
  flags: {
    verifiedCalculated: boolean;
    unverifiedCalculated: boolean;
    flaggedFiles: boolean;
    partnershipsCombined: boolean;
  };
}

