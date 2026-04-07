import {
  Vsi_participantprogramyearsvsi_enrolmentstatus,
  Vsi_participantprogramyearsvsi_taskstatus,
  Vsi_participantprogramyearsvsi_enrollmentregionaloffice,
  Vsi_participantprogramyearsvsi_farmingsector,
} from "../generated/models/Vsi_participantprogramyearsModel";
import type { Vsi_participantprogramyears } from "../generated/models/Vsi_participantprogramyearsModel";
import type { SortKey } from '../types/enrollment';

export function getEnrolmentStatusLabel(value: unknown): string {
  if (value == null) return '';
  return Vsi_participantprogramyearsvsi_enrolmentstatus[
    value as keyof typeof Vsi_participantprogramyearsvsi_enrolmentstatus
  ] ?? String(value);
}

export function getTaskStatusLabel(value: unknown): string {
  if (value == null) return '';
  return Vsi_participantprogramyearsvsi_taskstatus[
    value as keyof typeof Vsi_participantprogramyearsvsi_taskstatus
  ] ?? String(value);
}

export function taskStatusIcon(label: string): React.ReactNode {
  switch (label) {
    case 'Manual':
      return <span className="ts-icon ts-manual" title="Manual">&#x26A0;</span>;
    case 'Supervisor':
      return <span className="ts-icon ts-supervisor" title="Supervisor">&#x1F50D;</span>;
    case 'Ready':
      return <span className="ts-icon ts-ready" title="Ready">&#x2714;</span>;
    default:
      return null;
  }
}

export function enrolmentStatusClass(label: string): string {
  const map: Record<string, string> = {
    Enrolled: 'es-enrolled',
    Enrolled_NotPaid: 'es-notpaid',
    LateEnrolled: 'es-enrolled',
    EnrolmentFeesCalculated: 'es-calculated',
    UpdatedEnrolmentFeesCalculated: 'es-calculated',
    EnrolmentNoticeSent: 'es-notice',
    Initialized: 'es-init',
    Ineligible: 'es-ineligible',
    OptedOut: 'es-optedout',
    ToBeReviewed: 'es-review',
    NotEnoughInformation: 'es-review',
    Dormant: 'es-dormant',
  };
  return map[label] ?? '';
}

export function formatCurrency(value: unknown): string {
  if (value == null) return '';
  const n = Number(value);
  return isNaN(n) ? String(value) : '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getChoiceOptions(field: string): string[] {
  if (field === 'taskStatus') return Object.values(Vsi_participantprogramyearsvsi_taskstatus) as string[];
  if (field === 'enrolStatus') return Object.values(Vsi_participantprogramyearsvsi_enrolmentstatus) as string[];
  return [];
}

export function getSortValue(row: Vsi_participantprogramyears, key: SortKey): string | number {
  const raw = row as unknown as Record<string, unknown>;
  switch (key) {
    case 'pin': return row.vsi_name ?? '';
    case 'producer':
      return (row.vsi_participantidname
        ?? raw['_vsi_participantid_value@OData.Community.Display.V1.FormattedValue']
        ?? '') as string;
    case 'year':
      return (row.vsi_programyearidname
        ?? raw['_vsi_programyearid_value@OData.Community.Display.V1.FormattedValue']
        ?? '') as string;
    case 'taskStatus': return getTaskStatusLabel(row.vsi_taskstatus);
    case 'enrolStatus': return getEnrolmentStatusLabel(row.vsi_enrolmentstatus);
    case 'fee': return Number(row.vsi_calculatedenfee) || 0;
    case 'modifiedBy': {
      return (row.modifiedbyname
        ?? raw['_modifiedby_value@OData.Community.Display.V1.FormattedValue']
        ?? '') as string;
    }
    case 'totalFeesOwed': return Number(row.vsi_totalfeesowed) || 0;
    case 'totalFeesPaid': return Number(row.vsi_totalfeespaid) || 0;
    case 'enrolmentFee': return Number(row.vsi_enrolmentfee) || 0;
    case 'latePay': return Number(row.vsi_latepaymentfee) || 0;
    case 'modifiedOn': return row.modifiedon ?? '';
    case 'regionalOffice': return Vsi_participantprogramyearsvsi_enrollmentregionaloffice[row.vsi_enrollmentregionaloffice as keyof typeof Vsi_participantprogramyearsvsi_enrollmentregionaloffice] ?? '';
    case 'farmingSector': return Vsi_participantprogramyearsvsi_farmingsector[row.vsi_farmingsector as keyof typeof Vsi_participantprogramyearsvsi_farmingsector] ?? '';
    default: return '';
  }
}
