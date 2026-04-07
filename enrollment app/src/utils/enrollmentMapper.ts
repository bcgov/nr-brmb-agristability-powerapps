import type { Vsi_participantprogramyears } from "../generated/models/Vsi_participantprogramyearsModel";
import type { EnrollmentRecord } from "../types/enrollment";

type DataverseRow = Vsi_participantprogramyears & Record<string, unknown>;

const getFormattedValue = (row: DataverseRow, field: string) => {
  const value = row[`${field}@OData.Community.Display.V1.FormattedValue`];
  return value == null ? "" : String(value);
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value.replace(/[^0-9.-]/g, "");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const isTrueOption = (value: unknown) => value === true || value === 1 || value === "1";

export const mapDataverseEnrollment = (row: Vsi_participantprogramyears): EnrollmentRecord => {
  const typedRow = row as DataverseRow;

  const pin = String(row.vsi_name ?? row.vsi_participantprogramyearid ?? "");
  const producerName =
    getFormattedValue(typedRow, "_vsi_participantid_value") ||
    String(row.vsi_participantidname ?? row._vsi_participantid_value ?? "");
  const year =
    getFormattedValue(typedRow, "_vsi_programyearid_value") ||
    String(row.vsi_programyearidname ?? row._vsi_programyearid_value ?? "");
  const taskStatus =
    getFormattedValue(typedRow, "vsi_taskstatus") || String(row.vsi_taskstatusname ?? row.vsi_taskstatus ?? "");
  const enrolStatus =
    getFormattedValue(typedRow, "vsi_enrolmentstatus") ||
    String(row.vsi_enrolmentstatusname ?? row.vsi_enrolmentstatus ?? "");

  const enrolStatusLower = enrolStatus.toLowerCase();
  const taskStatusLower = taskStatus.toLowerCase();

  const calculatedFee = parseNumber(row.vsi_calculatedenfee);

  return {
    id: String(
      row.vsi_participantprogramyearid ??
        row._vsi_participantid_value ??
        `${pin}-${row.modifiedon ?? ""}-${row.vsi_calculatedenfee ?? ""}`
    ),
    pin,
    producerName,
    year,
    taskStatus,
    enrolStatus,
    calculatedFee,
    sharepointUrl: String(row.vsi_sharepointdocumentfolder ?? ""),
    modifiedOn: String(row.modifiedon ?? ""),
    flags: {
      verifiedCalculated: enrolStatusLower.includes("calculated") && !taskStatusLower.includes("manual"),
      unverifiedCalculated: enrolStatusLower.includes("calculated") && taskStatusLower.includes("manual"),
      flaggedFiles: isTrueOption(row.vsi_checkfordatafix) || isTrueOption(row.vsi_datafixapplied),
      partnershipsCombined:
        isTrueOption(row.vsi_haspartners) ||
        isTrueOption(row.vsi_incombinedfarm) ||
        Boolean(row.vsi_partnershippins) ||
        Boolean(row.vsi_combinedfarmpins),
    },
  };
};

export const formatCurrency = (value: number | null) => {
  if (value == null) return "";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatShortDate = (iso: string) => {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return iso;

  return new Date(timestamp).toLocaleDateString("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const taskStatusTone = (value: string) => {
  const text = value.toLowerCase();
  if (text.includes("ready")) return "ready";
  if (text.includes("supervisor")) return "supervisor";
  if (text.includes("manual")) return "manual";
  return "default";
};

export const enrolStatusTone = (value: string) => {
  const text = value.toLowerCase();
  if (text.includes("ineligible")) return "ineligible";
  if (text.includes("notpaid") || text.includes("not paid")) return "pending";
  if (text.includes("initialized")) return "neutral";
  if (text.includes("sent") || text.includes("updated")) return "notice";
  return "neutral";
};

