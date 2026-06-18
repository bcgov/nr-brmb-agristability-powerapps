import type {
  Vsi_participantprogramyears,
  Vsi_participantprogramyearsvsi_enrolmentstatus as EnrolmentStatusValue,
} from '../generated/models/Vsi_participantprogramyearsModel';
import { AccountsService } from '../generated/services/AccountsService';
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { Vsi_programyearsService } from '../generated/services/Vsi_programyearsService';
import { getCoreConfig } from '../hooks/useEnrolmentData';
import { DATAVERSE_ORG_URL_FALLBACK } from '../constants/config';
import { toDateInputValue } from '../utils/date';

export type PartnerComparisonRow = {
  operation: string;
  partnerParticipantPin: string;
  partnerPercent: string;
  firstName: string;
  lastName: string;
  partnershipName: string;
  enrolmentFee: unknown;
  enrolmentStatus: EnrolmentStatusValue | null;
  originalEnrolmentStatus: EnrolmentStatusValue | null;
  enrolmentFeesPaidDate: string;
  originalEnrolmentFeesPaidDate: string;
  partnerAccountId: string;
  partnerEnrolmentId: string;
};

export type CombinedFarmSummary = {
  participantPin: string;
  combinedFarmNumber: string;
  scenarioNumber: string;
};

type EnrolmentPartnerRsrc = {
  scenarioNumber?: number | string | null;
  operationSchedule?: string | null;
  operationPartnershipPin?: number | string | null;
  partnerPercent?: number | string | null;
  partnerParticipantPin?: number | string | null;
  partnerEnrolmentFee?: number | string | null;
  firstName?: string | null;
  lastName?: string | null;
  partnershipName?: string | null;
  dynamicProperties?: Partial<EnrolmentPartnerRsrc>;
};

export type EnrolmentPartnerListRsrc = {
  participantPin?: number | string | null;
  scenarioNumber?: number | string | null;
  inCombinedFarm?: boolean | number | string | null;
  combinedFarmNumber?: number | string | null;
  enrolmentPartnerList?: EnrolmentPartnerRsrc[] | null;
  dynamicProperties?: Partial<EnrolmentPartnerListRsrc>;
};

type XrmWebApiHost = {
  Xrm?: {
    WebApi?: {
      retrieveRecord?: (entityType: string, id: string, options?: string) => Promise<Record<string, unknown>>;
    };
  };
};

function getStringField(record: unknown, field: string): string {
  if (!record || typeof record !== 'object') return '';
  const raw = record as Record<string, unknown>;
  const value = raw[field];
  if (typeof value === 'string') return value.trim();

  const dynamicProperties = raw.dynamicProperties;
  if (dynamicProperties && typeof dynamicProperties === 'object') {
    const dynamicValue = (dynamicProperties as Record<string, unknown>)[field];
    if (typeof dynamicValue === 'string') return dynamicValue.trim();
  }

  return '';
}

async function getAccountFromXrm(accountId: string): Promise<Record<string, unknown> | null> {
  const candidates = [window, window.parent, window.top];
  for (const candidate of candidates) {
    try {
      if (!candidate) continue;
      const retrieveRecord = (candidate as unknown as XrmWebApiHost).Xrm?.WebApi?.retrieveRecord;
      if (!retrieveRecord) continue;
      return await retrieveRecord('account', accountId, '?$select=vsi_pin,accountnumber,name');
    } catch {
      // Try the next window context.
    }
  }
  return null;
}

export async function getParticipantPin(accountId: string): Promise<string> {
  const orgUrl = getCoreConfig().dataverseOrgUrl ?? DATAVERSE_ORG_URL_FALLBACK;
  const genericAccount = await MicrosoftDataverseService.GetItemWithOrganization(
    '',
    'application/json',
    orgUrl,
    'accounts',
    accountId,
    false,
    false,
    'vsi_pin,accountnumber,name',
  );
  let pin = getStringField(genericAccount.data, 'vsi_pin');
  if (!pin) pin = getStringField(genericAccount.data, 'accountnumber');
  if (pin) return pin;

  const account = await getAccountFromXrm(accountId);
  pin = getStringField(account, 'vsi_pin');
  if (!pin) pin = getStringField(account, 'accountnumber');
  return pin;
}

export function getNumericProgramYear(record: Vsi_participantprogramyears | null): number | null {
  const raw = record as unknown as Record<string, unknown> | null;
  const candidates = [
    record?.vsi_programyearidname,
    record?.vsi_name,
    raw?.['_vsi_programyearid_value@OData.Community.Display.V1.FormattedValue'],
  ];
  const match = candidates
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.match(/\b(19|20)\d{2}\b/))
    .find((result): result is RegExpMatchArray => result != null);
  return match ? Number(match[0]) : null;
}

function formatTextBlank(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function getNumberValue(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : Number.NEGATIVE_INFINITY;
}

function formatPartnerPercentValue(value: unknown): string {
  if (value == null || value === '') return '';
  const text = String(value).trim();
  const hasPercentSign = text.includes('%');
  const numberValue = Number(text.replace('%', '').trim());
  if (!Number.isFinite(numberValue)) return text;
  const percentValue = !hasPercentSign && numberValue > 0 && numberValue <= 1
    ? numberValue * 100
    : numberValue;
  return `${percentValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function getBooleanFieldValue(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function mergeDynamicProperties<T extends { dynamicProperties?: Partial<T> }>(value: T): T {
  return value.dynamicProperties ? { ...value, ...value.dynamicProperties } : value;
}

function getEnrolmentPartnerListResponse(response: unknown): EnrolmentPartnerListRsrc | null {
  if (!response || typeof response !== 'object') return null;
  return mergeDynamicProperties(response as EnrolmentPartnerListRsrc);
}

export function getPartnerRowsFromResponse(response: unknown): PartnerComparisonRow[] {
  const listResponse = getEnrolmentPartnerListResponse(response);
  const rows = (listResponse?.enrolmentPartnerList ?? [])
    .filter((row): row is EnrolmentPartnerRsrc => !!row && typeof row === 'object')
    .map(mergeDynamicProperties)
    .map(row => ({
      scenarioNumber: getNumberValue(row.scenarioNumber),
      operation: formatTextBlank(row.operationSchedule),
      operationPartnershipPin: formatTextBlank(row.operationPartnershipPin),
      partnerParticipantPin: formatTextBlank(row.partnerParticipantPin),
      partnerPercent: formatPartnerPercentValue(row.partnerPercent),
      firstName: formatTextBlank(row.firstName),
      lastName: formatTextBlank(row.lastName),
      partnershipName: formatTextBlank(row.partnershipName),
      enrolmentFee: row.partnerEnrolmentFee,
    }))
    .filter(row => row.partnerParticipantPin || row.firstName || row.lastName || row.partnershipName);

  const latestByPartner = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    const key = [
      row.operation,
      row.operationPartnershipPin,
      row.partnerParticipantPin,
      row.firstName,
      row.lastName,
      row.partnershipName,
    ].join('|');
    const existing = latestByPartner.get(key);
    if (!existing || row.scenarioNumber > existing.scenarioNumber) {
      latestByPartner.set(key, row);
    }
  }

  return [...latestByPartner.values()].map(row => ({
    operation: row.operation,
    partnerParticipantPin: row.partnerParticipantPin,
    partnerPercent: row.partnerPercent,
    firstName: row.firstName,
    lastName: row.lastName,
    partnershipName: row.partnershipName,
    enrolmentFee: row.enrolmentFee,
    enrolmentStatus: null,
    originalEnrolmentStatus: null,
    enrolmentFeesPaidDate: '',
    originalEnrolmentFeesPaidDate: '',
    partnerAccountId: '',
    partnerEnrolmentId: '',
  }));
}

export function getCombinedFarmSummaryFromResponse(response: unknown): CombinedFarmSummary | null {
  const listResponse = getEnrolmentPartnerListResponse(response);
  if (!listResponse || !getBooleanFieldValue(listResponse.inCombinedFarm)) return null;

  return {
    participantPin: formatTextBlank(listResponse.participantPin),
    combinedFarmNumber: formatTextBlank(listResponse.combinedFarmNumber),
    scenarioNumber: formatTextBlank(listResponse.scenarioNumber),
  };
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

export async function resolvePartnerAccountId(partnerPin: string): Promise<string | null> {
  const pin = partnerPin.trim();
  if (!pin) return null;
  const escapedPin = escapeODataString(pin);
  const accountResult = await AccountsService.getAll({
    select: ['accountid', 'vsi_pin', 'accountnumber'],
    filter: `(vsi_pin eq '${escapedPin}' or accountnumber eq '${escapedPin}') and statecode eq 0`,
    maxPageSize: 1,
  });
  return accountResult.data?.[0]?.accountid?.replace(/[{}]/g, '') ?? null;
}

export async function resolveProgramYearId(enrolmentProgramYear: number): Promise<string | null> {
  const programYearResult = await Vsi_programyearsService.getAll({
    select: ['vsi_programyearid', 'vsi_year'],
    filter: `vsi_year eq '${enrolmentProgramYear}' and statecode eq 0`,
    maxPageSize: 1,
  });
  return programYearResult.data?.[0]?.vsi_programyearid?.replace(/[{}]/g, '') ?? null;
}

export async function getPartnerDataverseDetails(
  partnerPin: string,
  programYearId: string,
): Promise<Pick<
  PartnerComparisonRow,
  | 'enrolmentStatus'
  | 'originalEnrolmentStatus'
  | 'enrolmentFeesPaidDate'
  | 'originalEnrolmentFeesPaidDate'
  | 'partnerAccountId'
  | 'partnerEnrolmentId'
>> {
  const accountId = await resolvePartnerAccountId(partnerPin);
  if (!accountId) {
    return {
      enrolmentStatus: null,
      originalEnrolmentStatus: null,
      enrolmentFeesPaidDate: '',
      originalEnrolmentFeesPaidDate: '',
      partnerAccountId: '',
      partnerEnrolmentId: '',
    };
  }

  const enrolmentResult = await Vsi_participantprogramyearsService.getAll({
    select: ['vsi_participantprogramyearid', 'vsi_enrolmentstatus', 'vsi_enrolmentfeespaiddate'],
    filter: `_vsi_participantid_value eq '${accountId}' and _vsi_programyearid_value eq '${programYearId}' and statecode eq 0`,
    maxPageSize: 1,
  });
  const enrolment = enrolmentResult.data?.[0];
  if (!enrolment) {
    return {
      enrolmentStatus: null,
      originalEnrolmentStatus: null,
      enrolmentFeesPaidDate: '',
      originalEnrolmentFeesPaidDate: '',
      partnerAccountId: accountId,
      partnerEnrolmentId: '',
    };
  }

  const paidDate = toDateInputValue(enrolment.vsi_enrolmentfeespaiddate);
  return {
    enrolmentStatus: enrolment.vsi_enrolmentstatus,
    originalEnrolmentStatus: enrolment.vsi_enrolmentstatus,
    enrolmentFeesPaidDate: paidDate,
    originalEnrolmentFeesPaidDate: paidDate,
    partnerAccountId: accountId,
    partnerEnrolmentId: enrolment.vsi_participantprogramyearid?.replace(/[{}]/g, '') ?? '',
  };
}

export async function resolvePartnerEnrolmentId(
  partnerPin: string,
  enrolmentProgramYear: number | null,
): Promise<string | null> {
  if (!enrolmentProgramYear) return null;
  const accountId = await resolvePartnerAccountId(partnerPin);
  if (!accountId) return null;

  const programYearId = await resolveProgramYearId(enrolmentProgramYear);
  if (!programYearId) return null;

  const enrolmentResult = await Vsi_participantprogramyearsService.getAll({
    select: ['vsi_participantprogramyearid'],
    filter: `_vsi_participantid_value eq '${accountId}' and _vsi_programyearid_value eq '${programYearId}' and statecode eq 0`,
    maxPageSize: 1,
  });
  return enrolmentResult.data?.[0]?.vsi_participantprogramyearid?.replace(/[{}]/g, '') ?? null;
}
