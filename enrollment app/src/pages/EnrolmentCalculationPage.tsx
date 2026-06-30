import { Fragment, useEffect, useMemo, useState } from 'react';
import { Calculator, CircleCheck, ExternalLink, PanelRightClose, PanelRightOpen, Pin, RefreshCw, Send } from 'lucide-react';
import sharepointIconUrl from '/icons/sharepoint.svg?url';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApprovalErrorModal } from '../components/ApprovalErrorModal';
import { Send45DayLetterModal } from '../components/Send45DayLetterModal';
import { ConfirmActionModal } from '../components/ConfirmActionModal';
import { ReferToSupervisorModal } from '../components/ReferToSupervisorModal';
import { getCoreConfig, normalizeCoreBaseUrl, patchEnrolmentCache, clearEnrolmentCache } from '../hooks/useEnrolmentData';
import { removeSaItemsFromCache, clearSaCache } from './SupervisorApprovalPage';
import { useRole } from '../context/RoleContext';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import { AccountsService } from '../generated/services/AccountsService';
import { ProcessEnrolmentActionService } from '../generated/services/ProcessEnrolmentActionService';
import { Vsi_armsconfigurationsService } from '../generated/services/Vsi_armsconfigurationsService';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { Vsi_programyearsService } from '../generated/services/Vsi_programyearsService';
import { farmsApi } from '../services/farmsApi';
import {
  enrichCombinedFarmSummaries,
  getCombinedFarmSummariesFromResponse,
  getPartnerRowsFromResponse,
  resolvePartnerAccountId,
  resolvePartnerEnrolmentId,
  type CombinedFarmSummary,
  type EnrolmentPartnerListRsrc,
  type PartnerComparisonRow,
} from '../services/enrolmentPartners';
import { resolveCurrentSystemUser } from '../utils/currentUser';
import { buildCoreEntityRecordHref, normalizeEnrolmentId, openInNewTab } from '../utils/deepLinks';
import { formatCurrencyOr, getAvatarColor, getInitials, getTaskStatusLabel } from '../utils/helpers';
import { CORE_APP_ID_FALLBACK, CORE_BASE_URL_FALLBACK } from '../constants/config';

const BENEFIT_MARGIN_COUNT = 5;
const APPROVABLE_STATUSES = new Set([865520005, 865520006]);
const APPROVABLE_TASK_STATUSES = new Set([865520000, 865520001, 865520002]);

type CalculationTableKey = 'enrolmentFee' | 'benefit' | 'proxy' | 'manual';

type CalculationError = string | {
  message?: string;
  errorMessage?: string;
  [key: string]: unknown;
};

type EnwProductiveValue = {
  bpuMargin?: number | null;
  productiveValue?: number | null;
};

type EnwProductiveUnit = {
  code?: string | null;
  description?: string | null;
  productiveCapacity?: number | null;
  productiveValues?: EnwProductiveValue[] | null;
};

type EnwEnrolment = {
  enrolmentFee?: number | null;
  contributionMargin?: number | null;
  benefitMarginYears?: number[] | null;
  proxyMarginYears?: number[] | null;
  enwProductiveUnits?: EnwProductiveUnit[] | null;
  proxyMargins?: Array<number | null> | null;
  benefitContributionMargin?: number | null;
  benefitEnrolmentFee?: number | null;
  proxyContributionMargin?: number | null;
  proxyEnrolmentFee?: number | null;
  manualContributionMargin?: number | null;
  manualEnrolmentFee?: number | null;
  enrolmentCalculationTypeCode?: string | null;
  benefitMarginYearMinus2?: number | null;
  benefitMarginYearMinus3?: number | null;
  benefitMarginYearMinus4?: number | null;
  benefitMarginYearMinus5?: number | null;
  benefitMarginYearMinus6?: number | null;
  benefitMarginYearMinus2Used?: boolean | null;
  benefitMarginYearMinus3Used?: boolean | null;
  benefitMarginYearMinus4Used?: boolean | null;
  benefitMarginYearMinus5Used?: boolean | null;
  benefitMarginYearMinus6Used?: boolean | null;
  manualMarginYearMinus2?: number | null;
  manualMarginYearMinus3?: number | null;
  manualMarginYearMinus4?: number | null;
};

type EnrolmentWorkflowCalculation = {
  benefitCalculationErrors?: CalculationError[] | null;
  enwEnrolment?: EnwEnrolment | null;
};

type HistoricalComparisonRow = {
  id: string;
  year: string;
  enrolmentName: string;
  totalFeesOwed: unknown;
};

type XrmWebApiHost = {
  Xrm?: {
    WebApi?: {
      retrieveRecord?: (entityType: string, id: string, options?: string) => Promise<Record<string, unknown>>;
      updateRecord?: (entityType: string, id: string, data: Record<string, unknown>) => Promise<{ entityType: string; id: string }>;
    };
  };
};

const getStringField = (record: unknown, field: string): string => {
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
};

function normalizeUrlBase(value: string): string {
  return value.replace(/\/+$/, '');
}

function getParticipantPinFromEnrolmentName(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  if (!text) return '';
  const numericTokens = text.match(/\b\d{4,}\b/g);
  return numericTokens?.at(-1) ?? text;
}

async function getFarmsLegacyBaseUrl(): Promise<string | null> {
  const result = await Vsi_armsconfigurationsService.getAll({
    maxPageSize: 50,
  });
  const configRows = result.data ?? [];
  const farmsUrl = configRows
    .map(row => getStringField(row, 'cr4dd_FARMSURLNEW') || getStringField(row, 'cr4dd_farmsurlnew'))
    .find((candidate): candidate is string => !!candidate);
  return farmsUrl ? normalizeUrlBase(farmsUrl) : null;
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

async function getAccountPinFromXrm(accountId: string): Promise<string> {
  const account = await getAccountFromXrm(accountId);
  let pin = getStringField(account, 'vsi_pin');
  if (!pin) pin = getStringField(account, 'accountnumber');
  return pin;
}

async function getAccountPin(accountId: string): Promise<string> {
  let account: unknown = null;
  try {
    account = (await AccountsService.get(accountId, {
      select: ['vsi_pin', 'accountnumber', 'name'],
    })).data;
  } catch {
    account = null;
  }

  let pin = getStringField(account, 'vsi_pin');
  if (!pin) pin = getStringField(account, 'accountnumber');
  if (pin) return pin;

  return getAccountPinFromXrm(accountId);
}

function getProgramYear(record: Vsi_participantprogramyears | null): number | null {
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

function getProgramYearFromRow(record: Vsi_participantprogramyears): number | null {
  return getProgramYear(record);
}

function normalizeGuid(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[{}]/g, '').toLowerCase() : '';
}

function getBooleanText(value: unknown): string {
  if (value === true || value === 1 || value === '1') return 'Yes';
  if (value === false || value === 0 || value === '0') return 'No';
  return '';
}

function formatNumberOrBlank(value: unknown, fractionDigits: number): string {
  if (value == null || value === '') return '';
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value);
  return numberValue.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatCurrencyBlank(value: unknown): string {
  return formatCurrencyOr(value, '');
}

function buildFarmsScenarioUrl(baseUrl: string, pinValue: string, scenarioProgramYear: number | null): string {
  if (!baseUrl || !pinValue || !scenarioProgramYear) return '';
  const params = new URLSearchParams({
    pin: pinValue,
    year: String(scenarioProgramYear),
    refresh: 'true',
  });
  return `${baseUrl}/farm800.do?${params.toString()}`;
}

function getHistoricalComparisonRows(
  rows: Vsi_participantprogramyears[],
  currentProgramYear: number,
  programYearById: Map<string, number>,
): HistoricalComparisonRow[] {
  return rows
    .map(row => {
      const year = programYearById.get(normalizeGuid(row._vsi_programyearid_value)) ?? getProgramYearFromRow(row);
      return { row, year };
    })
    .filter((item): item is { row: Vsi_participantprogramyears; year: number } => (
      item.year != null && item.year < currentProgramYear
    ))
    .sort((a, b) => b.year - a.year)
    .slice(0, 5)
    .map(({ row, year }) => ({
      id: row.vsi_participantprogramyearid,
      year: String(year),
      enrolmentName: row.vsi_name ?? '',
      totalFeesOwed: row.vsi_totalfeesowed,
    }));
}

function getFarmsWorkflowErrorMessage(error: unknown): string {
  const fallback = 'Unable to load FARMS enrolment calculation.';
  const message = error instanceof Error ? error.message : String(error || fallback);
  return message.includes('404') ? 'No ENW scenario has been created in FARMS.' : message;
}

function getErrorText(error: CalculationError): string {
  if (typeof error === 'string') return error;
  return error.message ?? error.errorMessage ?? JSON.stringify(error);
}

function getErrorSearchText(error: CalculationError): string {
  if (typeof error === 'string') return error.toLowerCase();
  return Object.values(error)
    .filter(value => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    .join(' ')
    .toLowerCase();
}

function matchesCalculationTable(error: CalculationError, table: CalculationTableKey): boolean {
  const text = getErrorSearchText(error);
  if (!text) return false;
  switch (table) {
    case 'enrolmentFee':
      return text.includes('enrolment fee') || text.includes('enrollment fee') || text.includes('enrolmentfee') || text.includes('enrollmentfee');
    case 'benefit':
      return text.includes('benefit');
    case 'proxy':
      return text.includes('proxy') || text.includes('productive') || text.includes('bpu');
    case 'manual':
      return text.includes('manual');
    default:
      return false;
  }
}

function getTableErrorMessages(calculation: EnrolmentWorkflowCalculation | null, table: CalculationTableKey): string[] {
  return (calculation?.benefitCalculationErrors ?? [])
    .filter(error => matchesCalculationTable(error, table))
    .map(getErrorText);
}

function getUnmatchedErrorMessages(calculation: EnrolmentWorkflowCalculation | null): string[] {
  return (calculation?.benefitCalculationErrors ?? [])
    .filter(error => !matchesCalculationTable(error, 'enrolmentFee')
      && !matchesCalculationTable(error, 'benefit')
      && !matchesCalculationTable(error, 'proxy')
      && !matchesCalculationTable(error, 'manual'))
    .map(getErrorText);
}

function CalculationErrorMessages({ messages }: { messages: string[] }) {
  if (!messages.length) return null;
  return (
    <div className="calc-legacy-error" role="alert">
      {messages.map((message, index) => (
        <div key={`${message}-${index}`}>{message}</div>
      ))}
    </div>
  );
}

function CalculationOption({ checked, label }: { checked: boolean; label: string }) {
  return (
    <label className="calc-benefit-option">
      <input
        className="calc-benefit-radio"
        type="radio"
        checked={checked}
        readOnly
        tabIndex={-1}
        onChange={() => undefined}
      />
      <span className={`calc-benefit-radio-visual${checked ? ' calc-benefit-radio-visual-checked' : ''}`} aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

function HistoricalComparisonPanel({
  rows,
  loading,
  error,
  open,
  pinned,
  onToggleOpen,
  onTogglePinned,
}: {
  rows: HistoricalComparisonRow[];
  loading: boolean;
  error: string | null;
  open: boolean;
  pinned: boolean;
  onToggleOpen: () => void;
  onTogglePinned: () => void;
}) {
  if (!open) {
    return (
      <aside className="calc-comparison-panel calc-comparison-panel-collapsed" aria-label="Historical comparison panel">
        <button className="calc-panel-tab" type="button" onClick={onToggleOpen} title="Expand historical comparison panel" aria-label="Expand historical comparison panel">
          <PanelRightOpen size={14} aria-hidden="true" />
          <span>Historical Comparison</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="calc-comparison-panel" aria-label="Historical comparison panel">
      <div className="calc-comparison-header">
        <h2>Historical Comparison</h2>
        <div className="calc-comparison-actions">
          <button
            className={`calc-panel-icon-btn${pinned ? ' calc-panel-icon-btn-active' : ''}`}
            type="button"
            onClick={onTogglePinned}
            title={pinned ? 'Unpin panel' : 'Pin panel'}
            aria-label={pinned ? 'Unpin historical comparison panel' : 'Pin historical comparison panel'}
          >
            <Pin size={14} aria-hidden="true" />
          </button>
          <button className="calc-panel-icon-btn calc-panel-icon-btn-square" type="button" onClick={onToggleOpen} title="Collapse historical comparison panel" aria-label="Collapse historical comparison panel">
            <PanelRightClose size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {loading && <p className="calc-panel-state">Loading history...</p>}
      {error && <p className="calc-panel-state calc-panel-state-error">{error}</p>}
      {!loading && !error && rows.length === 0 && <p className="calc-panel-state">No historical enrolment fees found.</p>}
      {!loading && !error && rows.length > 0 && (
        <div className="calc-history-list">
          {rows.map(row => (
            <div className="calc-history-card" key={row.id || `${row.year}-${row.enrolmentName}`}>
              <div className="calc-history-card-top">
                <div>
                  <div className="calc-history-year">{row.year}</div>
                  <div className="calc-history-name">{row.enrolmentName || '-'}</div>
                </div>
              </div>
              <dl className="calc-history-details">
                <div>
                  <dt>Total Fees Owed</dt>
                  <dd>{formatCurrencyBlank(row.totalFeesOwed)}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function PartnerViewPanel({
  rows,
  combinedFarms,
  loading,
  error,
  enrolmentProgramYear,
  openingPartnerPin,
  partnerNavigationError,
  open,
  pinned,
  onToggleOpen,
  onTogglePinned,
  onOpenCombinedFarmEnrolment,
  onOpenCombinedFarmCalculation,
  onOpenCombinedFarmAccount,
  onOpenPartnerAccount,
  onOpenPartnerDetails,
  onOpenPartnerCalculation,
}: {
  rows: PartnerComparisonRow[];
  combinedFarms: CombinedFarmSummary[];
  loading: boolean;
  error: string | null;
  enrolmentProgramYear: number | null;
  openingPartnerPin: string | null;
  partnerNavigationError: string | null;
  open: boolean;
  pinned: boolean;
  onToggleOpen: () => void;
  onTogglePinned: () => void;
  onOpenCombinedFarmEnrolment: (combinedFarm: CombinedFarmSummary) => Promise<void>;
  onOpenCombinedFarmCalculation: (combinedFarm: CombinedFarmSummary) => Promise<void>;
  onOpenCombinedFarmAccount: (combinedFarm: CombinedFarmSummary) => void;
  onOpenPartnerAccount: (row: PartnerComparisonRow) => Promise<void>;
  onOpenPartnerDetails: (row: PartnerComparisonRow) => Promise<void>;
  onOpenPartnerCalculation: (row: PartnerComparisonRow) => Promise<void>;
}) {
  const visibleRows = rows.filter((row): row is PartnerComparisonRow => (
    !!row && (
      row.partnerParticipantPin.length > 0
      || row.firstName.length > 0
      || row.lastName.length > 0
      || row.partnershipName.length > 0
    )
  ));
  const hasCombinedFarm = combinedFarms.length > 0;

  if (!open) {
    return (
      <aside className="calc-comparison-panel calc-comparison-panel-collapsed" aria-label="Partner comparison panel">
        <button className="calc-panel-tab" type="button" onClick={onToggleOpen} title="Expand partner panel" aria-label="Expand partner panel">
          <PanelRightOpen size={14} aria-hidden="true" />
          <span>Partner view</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="calc-comparison-panel" aria-label="Partner comparison panel">
      <div className="calc-comparison-header">
        <h2>Partner view</h2>
        <div className="calc-comparison-actions">
          <button
            className={`calc-panel-icon-btn${pinned ? ' calc-panel-icon-btn-active' : ''}`}
            type="button"
            onClick={onTogglePinned}
            title={pinned ? 'Unpin panel' : 'Pin panel'}
            aria-label={pinned ? 'Unpin partner panel' : 'Pin partner panel'}
          >
            <Pin size={14} aria-hidden="true" />
          </button>
          <button className="calc-panel-icon-btn calc-panel-icon-btn-square" type="button" onClick={onToggleOpen} title="Collapse partner panel" aria-label="Collapse partner panel">
            <PanelRightClose size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {loading && <p className="calc-panel-state">Loading partners...</p>}
      {error && <p className="calc-panel-state calc-panel-state-error">{error}</p>}
      {partnerNavigationError && <p className="calc-panel-state calc-panel-state-error">{partnerNavigationError}</p>}
      {!loading && !error && !visibleRows.length && !hasCombinedFarm && <p className="calc-panel-state">No partner data found.</p>}
      {!loading && !error && combinedFarms.length > 0 && (
        <div className="calc-combined-farm">
          <h3>Combined farm</h3>
          <table className="calc-combined-farm-table">
            <thead>
              <tr>
                <th scope="col">PIN</th>
                <th scope="col">Name</th>
                <th scope="col">Combined Farm Number</th>
                <th scope="col">Scenario</th>
                <th scope="col" aria-label="Calculation"></th>
              </tr>
            </thead>
            <tbody>
              {combinedFarms.map(combinedFarm => (
                <tr key={`${combinedFarm.participantPin}-${combinedFarm.scenarioNumber}`}>
                  <td>
                    {combinedFarm.participantPin ? (
                      <button
                        className="calc-combined-farm-pin-link"
                        type="button"
                        onClick={() => void onOpenCombinedFarmEnrolment(combinedFarm)}
                        disabled={!enrolmentProgramYear || openingPartnerPin === combinedFarm.participantPin}
                        title={enrolmentProgramYear ? `Open ${enrolmentProgramYear} deadlines and fees` : 'Program year is unavailable'}
                      >
                        {combinedFarm.participantPin}
                      </button>
                    ) : '-'}
                  </td>
                  <td>
                    {combinedFarm.participantName && combinedFarm.participantAccountId ? (
                      <button
                        className="calc-combined-farm-name-link"
                        type="button"
                        onClick={() => onOpenCombinedFarmAccount(combinedFarm)}
                        title={`Open CORE account for ${combinedFarm.participantName}`}
                      >
                        {combinedFarm.participantName}
                      </button>
                    ) : combinedFarm.participantName || '-'}
                  </td>
                  <td>{combinedFarm.combinedFarmNumber || '-'}</td>
                  <td>{combinedFarm.scenarioNumber || '-'}</td>
                  <td className="calc-combined-farm-calculation-cell">
                    <button
                      className="calc-partner-calculation-btn calc-combined-farm-calculation-btn"
                      type="button"
                      onClick={() => void onOpenCombinedFarmCalculation(combinedFarm)}
                      disabled={!combinedFarm.participantPin || !enrolmentProgramYear || openingPartnerPin === combinedFarm.participantPin}
                      title={enrolmentProgramYear ? `Open ${enrolmentProgramYear} calculation` : 'Program year is unavailable'}
                      aria-label={`Open calculation for PIN ${combinedFarm.participantPin}`}
                    >
                      <Calculator size={20} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && visibleRows.length > 0 && (
        <div className="calc-partner-list">
          {visibleRows.map(row => {
            const displayName = [row.firstName, row.lastName].filter(Boolean).join(' ') || row.partnershipName;
            const partnerPin = row.partnerParticipantPin;
            const openingPartner = openingPartnerPin === partnerPin;
            return (
              <div className="calc-partner-card" key={`${row.operation}-${row.partnerParticipantPin}-${row.firstName}-${row.lastName}`}>
                <div className="calc-partner-card-top">
                  <div>
                    {displayName && partnerPin ? (
                      <button
                        className="calc-partner-name calc-partner-name-link"
                        type="button"
                        onClick={() => void onOpenPartnerAccount(row)}
                        disabled={openingPartner}
                        title={`Open CORE account for ${displayName}`}
                      >
                        {displayName}
                      </button>
                    ) : (
                      <div className="calc-partner-name">{displayName || '-'}</div>
                    )}
                    <div className="calc-partner-pin">
                      PIN{' '}
                      {partnerPin ? (
                        <button
                          className="calc-partner-pin-link"
                          type="button"
                          onClick={() => void onOpenPartnerDetails(row)}
                          disabled={!enrolmentProgramYear || openingPartner}
                        >
                          {partnerPin}
                        </button>
                      ) : '-'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    <button
                      className="calc-partner-calculation-btn"
                      type="button"
                      onClick={() => void onOpenPartnerCalculation(row)}
                      disabled={!partnerPin || !enrolmentProgramYear || openingPartner}
                      title={enrolmentProgramYear ? `Open ${enrolmentProgramYear} calculation` : 'Program year is unavailable'}
                      aria-label={`Open calculation for PIN ${partnerPin}`}
                    >
                      <Calculator size={20} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <dl className="calc-partner-details">
                  <div>
                    <dt>Operation</dt>
                    <dd>{row.operation || '-'}</dd>
                  </div>
                  <div>
                    <dt>Partnership Percent</dt>
                    <dd>{row.partnerPercent || '-'}</dd>
                  </div>
                  <div>
                    <dt>Enrolment Fee</dt>
                    <dd>{formatCurrencyBlank(row.enrolmentFee)}</dd>
                  </div>
                  <div>
                    <dt>Partnership Name</dt>
                    <dd>{row.partnershipName || '-'}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function getApprovalError(
  record: Vsi_participantprogramyears,
): string | null {
  const enrolmentName = record.vsi_name ?? 'This enrolment';

  if (!APPROVABLE_STATUSES.has(record.vsi_enrolmentstatus as unknown as number)) {
    return `${enrolmentName} cannot be approved because its enrolment status is not Verified EN Calculated or Unverified EN Calculated.`;
  }

  if (!APPROVABLE_TASK_STATUSES.has(record.vsi_taskstatus as unknown as number)) {
    return `${enrolmentName} cannot be approved because its task status must be Manual, Supervisor, or Ready.`;
  }

  if (record.vsi_enrolmentfee == null) {
    return `${enrolmentName} cannot be approved because it does not have a calculated fee.`;
  }

  return null;
}

export function EnrolmentCalculationPage() {
  const { enrolmentId, source } = useParams<{ enrolmentId: string; source: string }>();
  const navigate = useNavigate();
  const { activeRole } = useRole();
  const routeSource = source === 'supervisor' || source === 'deadline-reminders' ? source : 'dashboard';
  const backTo = routeSource === 'supervisor' ? '/supervisor-approval' : routeSource === 'deadline-reminders' ? '/deadline-reminders' : '/dashboard-home';
  const backLabel = routeSource === 'supervisor' ? 'Back to Supervisor Approval' : routeSource === 'deadline-reminders' ? 'Back to Deadline Reminders' : 'Back to Enrolments';
  const resolvedEnrolmentId = normalizeEnrolmentId(enrolmentId);
  const [record, setRecord] = useState<Vsi_participantprogramyears | null>(null);
  const [participantPin, setParticipantPin] = useState('');
  const [participantPinLoading, setParticipantPinLoading] = useState(false);
  const [farmsLegacyBaseUrl, setFarmsLegacyBaseUrl] = useState('');
  const [farmsLegacyBaseUrlLoading, setFarmsLegacyBaseUrlLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [approvalErrorModal, setApprovalErrorModal] = useState<string | null>(null);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [farmsWorkflowCalculation, setFarmsWorkflowCalculation] = useState<EnrolmentWorkflowCalculation | null>(null);
  const [farmsWorkflowCalculationLoading, setFarmsWorkflowCalculationLoading] = useState(false);
  const [farmsWorkflowCalculationError, setFarmsWorkflowCalculationError] = useState<string | null>(null);
  const [show45DayModal, setShow45DayModal] = useState(false);
  const [letterSentMessage, setLetterSentMessage] = useState<string | null>(null);
  const [counterActionLoading, setCounterActionLoading] = useState(false);
  const [counterActionError, setCounterActionError] = useState<string | null>(null);
  const [partnerRows, setPartnerRows] = useState<PartnerComparisonRow[]>([]);
  const [combinedFarmRows, setCombinedFarmRows] = useState<CombinedFarmSummary[]>([]);
  const [partnerRowsLoading, setPartnerRowsLoading] = useState(false);
  const [partnerRowsError, setPartnerRowsError] = useState<string | null>(null);
  const [openingPartnerPin, setOpeningPartnerPin] = useState<string | null>(null);
  const [partnerNavigationError, setPartnerNavigationError] = useState<string | null>(null);
  const [partnerPanelOpen, setPartnerPanelOpen] = useState(true);
  const [partnerPanelPinned, setPartnerPanelPinned] = useState(true);
  const [historicalRows, setHistoricalRows] = useState<HistoricalComparisonRow[]>([]);
  const [historicalRowsLoading, setHistoricalRowsLoading] = useState(false);
  const [historicalRowsError, setHistoricalRowsError] = useState<string | null>(null);
  const [historicalPanelOpen, setHistoricalPanelOpen] = useState(true);
  const [historicalPanelPinned, setHistoricalPanelPinned] = useState(true);
  const [coreAppId, setCoreAppId] = useState<string | null>(() => getCoreConfig().coreAppId);
  const [coreBaseUrl, setCoreBaseUrl] = useState<string | null>(() => getCoreConfig().coreBaseUrl);

  useEffect(() => {
    if (coreAppId !== null) return;
    Vsi_armsconfigurationsService.getAll({ maxPageSize: 50, select: ['cr4dd_coreappid', 'vsi_coreenvironmenturl'] })
      .then(result => {
        const rows = result.data ?? [];
        setCoreAppId(rows.map(r => r.cr4dd_coreappid?.trim()).find((c): c is string => !!c) ?? null);
        setCoreBaseUrl(rows.map(r => normalizeCoreBaseUrl(r.vsi_coreenvironmenturl)).find((c): c is string => !!c) ?? null);
      })
      .catch(() => {});
  }, [coreAppId]);

  useEffect(() => {
    if (!resolvedEnrolmentId) {
      setError('Missing enrolment id.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        let result = await Vsi_participantprogramyearsService.get(resolvedEnrolmentId, {
          select: [
            'vsi_name',
            'vsi_taskstatus',
            'vsi_enrolmentstatus',
            '_ownerid_value',
            'owneridname',
            'vsi_enrolmentfee',
            'vsi_previousyearcalculatedenfee',
            'modifiedon',
            '_vsi_programyearid_value',
            'vsi_programyearidname',
            '_vsi_participantid_value',
            'vsi_participantidname',
            'vsi_sharepointdocumentfolder',
            'vsi_contributionmargin',
            'vsi_enrolmentfee',
            'vsi_programyearmargin1',
            'vsi_programyearmargin1used',
            'vsi_programyearmargin2',
            'vsi_programyearmargin2used',
            'vsi_programyearmargin3',
            'vsi_programyearmargin3used',
            'vsi_programyearmargin4',
            'vsi_programyearmargin4used',
            'vsi_programyearmargin5',
            'vsi_programyearmargin5used',
            'vsi_fortyfivedayletterstartdate',
            'vsi_fortyfivedaylettersent',
            'vsi_fortyfivedaycounterpaused',
            'vsi_fortyfivedaypausedate',
            'vsi_haspartners',
            'vsi_partnershipnames',
            'vsi_partnershippins',
            'vsi_partnershippercents',
            'vsi_isnewparticipant',
            'vsi_fullyprovinciallyfunded',
          ],
        });

        // Match the details page behavior: some environments can return no data
        // for a selected retrieve even when the full record is readable.
        if (!result?.data) {
          result = await Vsi_participantprogramyearsService.get(resolvedEnrolmentId);
        }

        if (cancelled) return;
        if (!result.data) {
          setError(result.error?.message ?? 'Unable to load enrolment calculation data.');
          setRecord(null);
          return;
        }

        setRecord(result.data);

        const participantId = result.data._vsi_participantid_value?.replace(/[{}]/g, '');
        const enrolmentPin = getParticipantPinFromEnrolmentName(result.data.vsi_name);
        setParticipantPin(enrolmentPin);
        if (!enrolmentPin && participantId) {
          setParticipantPinLoading(true);
          try {
            const pin = await getAccountPin(participantId);
            if (!cancelled) setParticipantPin(pin);
          } catch {
            if (!cancelled) setParticipantPin('');
          } finally {
            if (!cancelled) setParticipantPinLoading(false);
          }
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedEnrolmentId, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setFarmsLegacyBaseUrlLoading(true);
    getFarmsLegacyBaseUrl()
      .then((url) => {
        if (!cancelled) setFarmsLegacyBaseUrl(url ?? '');
      })
      .catch(() => {
        if (!cancelled) setFarmsLegacyBaseUrl('');
      })
      .finally(() => {
        if (!cancelled) setFarmsLegacyBaseUrlLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const sharePointFolderUrl = record?.vsi_sharepointdocumentfolder;
  const programYear = useMemo(() => getProgramYear(record), [record]);
  const farmsScenarioProgramYear = programYear ? programYear - 2 : null;
  const farmsScenarioUrl = useMemo(() => {
    return buildFarmsScenarioUrl(farmsLegacyBaseUrl, participantPin, farmsScenarioProgramYear);
  }, [farmsLegacyBaseUrl, participantPin, farmsScenarioProgramYear]);

  useEffect(() => {
    const participantId = record?._vsi_participantid_value?.replace(/[{}]/g, '');
    if (!participantId || !programYear) {
      setHistoricalRows([]);
      setHistoricalRowsError(null);
      setHistoricalRowsLoading(false);
      return;
    }

    let cancelled = false;
    setHistoricalRows([]);
    setHistoricalRowsError(null);
    setHistoricalRowsLoading(true);

    Promise.all([
      Vsi_participantprogramyearsService.getAll({
        select: [
          'vsi_participantprogramyearid',
          'vsi_name',
          '_vsi_programyearid_value',
          'vsi_totalfeesowed',
        ],
        filter: `_vsi_participantid_value eq '${participantId}' and statecode eq 0`,
        orderBy: ['modifiedon desc'],
        maxPageSize: 50,
      }),
      Vsi_programyearsService.getAll({
        select: ['vsi_programyearid', 'vsi_year'],
        filter: 'statecode eq 0',
        orderBy: ['vsi_year desc'],
        maxPageSize: 100,
      }),
    ])
      .then(([historyResult, programYearsResult]) => {
        if (cancelled) return;
        if (historyResult.error) {
          throw new Error(historyResult.error.message ?? 'Unable to load historical enrolment fees.');
        }
        if (programYearsResult.error) {
          throw new Error(programYearsResult.error.message ?? 'Unable to load program years for historical comparison.');
        }

        const programYearById = new Map<string, number>();
        for (const programYearRow of programYearsResult.data ?? []) {
          const id = normalizeGuid(programYearRow.vsi_programyearid);
          const year = Number(programYearRow.vsi_year);
          if (id && Number.isFinite(year)) {
            programYearById.set(id, year);
          }
        }

        setHistoricalRows(getHistoricalComparisonRows(historyResult.data ?? [], programYear, programYearById));
      })
      .catch(err => {
        if (cancelled) return;
        setHistoricalRows([]);
        setHistoricalRowsError(err instanceof Error ? err.message : 'Unable to load historical enrolment fees.');
      })
      .finally(() => {
        if (!cancelled) setHistoricalRowsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [record, programYear]);

  useEffect(() => {
    if (!participantPin || !farmsScenarioProgramYear) {
      setFarmsWorkflowCalculation(null);
      setFarmsWorkflowCalculationError(null);
      setFarmsWorkflowCalculationLoading(false);
      return;
    }

    let cancelled = false;
    setFarmsWorkflowCalculation(null);
    setFarmsWorkflowCalculationError(null);
    setFarmsWorkflowCalculationLoading(true);

    farmsApi.getEnrolmentNoticeWorkflowCalculation<EnrolmentWorkflowCalculation>(
      participantPin,
      farmsScenarioProgramYear,
    )
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          throw new Error(result.error?.message ?? 'Unable to load FARMS enrolment calculation.');
        }
        setFarmsWorkflowCalculation(result.data ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setFarmsWorkflowCalculation(null);
        setFarmsWorkflowCalculationError(getFarmsWorkflowErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setFarmsWorkflowCalculationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [participantPin, farmsScenarioProgramYear]);

  useEffect(() => {
    if (!participantPin || !farmsScenarioProgramYear) {
      setPartnerRows([]);
      setCombinedFarmRows([]);
      setPartnerRowsError(null);
      setPartnerRowsLoading(false);
      return;
    }

    let cancelled = false;
    setPartnerRows([]);
    setCombinedFarmRows([]);
    setPartnerRowsError(null);
    setPartnerRowsLoading(true);

    farmsApi.getEnrolmentPartners<EnrolmentPartnerListRsrc>(
      participantPin,
      farmsScenarioProgramYear,
    )
      .then(async (result) => {
        if (cancelled) return;
        if (!result.success) {
          throw new Error(result.error?.message ?? 'Unable to load FARMS enrolment partners.');
        }
        const combinedFarms = await enrichCombinedFarmSummaries(
          getCombinedFarmSummariesFromResponse(result.data),
        );
        if (cancelled) return;
        setPartnerRows(getPartnerRowsFromResponse(result.data));
        setCombinedFarmRows(combinedFarms);
      })
      .catch((err) => {
        if (cancelled) return;
        setPartnerRows([]);
        setCombinedFarmRows([]);
        setPartnerRowsError(err instanceof Error ? err.message : 'Unable to load FARMS enrolment partners.');
      })
      .finally(() => {
        if (!cancelled) setPartnerRowsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [participantPin, farmsScenarioProgramYear]);

  const participantName = useMemo(() => {
    if (!record) return '';
    const raw = record as unknown as Record<string, unknown>;
    return (record.vsi_participantidname
      ?? raw['_vsi_participantid_value@OData.Community.Display.V1.FormattedValue']
      ?? '') as string;
  }, [record]);
  const ownerName = record
    ? (record.owneridname || ((record as unknown as Record<string, unknown>)['_ownerid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined) || null)
    : null;
  const taskStatusLabel = getTaskStatusLabel(record?.vsi_taskstatus) || null;
  const participantHref = useMemo(() => {
    if (!record) return null;
    const participantId = record._vsi_participantid_value;
    if (!participantId) return null;
    const appId = coreAppId?.trim() || CORE_APP_ID_FALLBACK;
    const baseUrl = coreBaseUrl?.trim() || CORE_BASE_URL_FALLBACK;
    return buildCoreEntityRecordHref(baseUrl, appId, 'account', participantId);
  }, [record, coreAppId, coreBaseUrl]);
  const fallbackBenefitYears = useMemo(() => {
    return Array.from({ length: BENEFIT_MARGIN_COUNT }, (_, index) => (
      programYear ? String(programYear - (BENEFIT_MARGIN_COUNT + 1) + index) : `Year ${index + 1}`
    ));
  }, [programYear]);
  const farmsEnrolment = farmsWorkflowCalculation?.enwEnrolment ?? null;
  const calculationTypeCode = (farmsEnrolment?.enrolmentCalculationTypeCode ?? '').toUpperCase();
  const benefitMarginRows = useMemo(() => {
    const apiYears = farmsEnrolment?.benefitMarginYears?.map(String) ?? [];
    const labels = apiYears.length ? apiYears : fallbackBenefitYears;
    const apiMargins = [
      farmsEnrolment?.benefitMarginYearMinus6,
      farmsEnrolment?.benefitMarginYearMinus5,
      farmsEnrolment?.benefitMarginYearMinus4,
      farmsEnrolment?.benefitMarginYearMinus3,
      farmsEnrolment?.benefitMarginYearMinus2,
    ];
    const apiUsed = [
      farmsEnrolment?.benefitMarginYearMinus6Used,
      farmsEnrolment?.benefitMarginYearMinus5Used,
      farmsEnrolment?.benefitMarginYearMinus4Used,
      farmsEnrolment?.benefitMarginYearMinus3Used,
      farmsEnrolment?.benefitMarginYearMinus2Used,
    ];

    return labels.map((label, index) => {
      const position = index + 1;
      const raw = (record ?? {}) as unknown as Record<string, unknown>;
      return {
        label,
        margin: apiYears.length ? apiMargins[index] : raw[`vsi_programyearmargin${position}`],
        used: apiYears.length ? apiUsed[index] : raw[`vsi_programyearmargin${position}used`],
      };
    });
  }, [fallbackBenefitYears, farmsEnrolment, record]);
  const proxyYears = useMemo(() => {
    if (farmsEnrolment?.proxyMarginYears?.length) return farmsEnrolment.proxyMarginYears.map(String);
    if (farmsScenarioProgramYear) {
      return [farmsScenarioProgramYear - 2, farmsScenarioProgramYear - 1, farmsScenarioProgramYear].map(String);
    }
    return ['Year 1', 'Year 2', 'Year 3'];
  }, [farmsEnrolment?.proxyMarginYears, farmsScenarioProgramYear]);
  const manualMargins = [
    farmsEnrolment?.manualMarginYearMinus4,
    farmsEnrolment?.manualMarginYearMinus3,
    farmsEnrolment?.manualMarginYearMinus2,
  ];
  const tableErrors = {
    enrolmentFee: getTableErrorMessages(farmsWorkflowCalculation, 'enrolmentFee'),
    benefit: getTableErrorMessages(farmsWorkflowCalculation, 'benefit'),
    proxy: getTableErrorMessages(farmsWorkflowCalculation, 'proxy'),
    manual: getTableErrorMessages(farmsWorkflowCalculation, 'manual'),
    unmatched: getUnmatchedErrorMessages(farmsWorkflowCalculation),
  };

  const openPartnerEnrolment = async (row: PartnerComparisonRow, target: 'details' | 'calculation') => {
    const partnerPin = row.partnerParticipantPin.trim();
    if (!partnerPin || !programYear) {
      setPartnerNavigationError('Partner PIN or enrolment year is missing.');
      return;
    }

    setOpeningPartnerPin(partnerPin);
    setPartnerNavigationError(null);
    try {
      const partnerEnrolmentId = await resolvePartnerEnrolmentId(partnerPin, programYear);
      if (!partnerEnrolmentId) {
        setPartnerNavigationError(`No ${programYear} enrolment found for partner PIN ${partnerPin}.`);
        return;
      }
      void openInNewTab(`#/${target === 'details' ? 'enrolment' : 'calculation'}/${routeSource}/${partnerEnrolmentId}`);
    } catch (err) {
      setPartnerNavigationError(err instanceof Error ? err.message : 'Unable to open partner enrolment.');
    } finally {
      setOpeningPartnerPin(null);
    }
  };

  const openCombinedFarmEnrolment = async (
    combinedFarm: CombinedFarmSummary,
    target: 'details' | 'calculation',
  ) => {
    const combinedFarmPin = combinedFarm.participantPin.trim();
    if (!combinedFarmPin || !programYear) {
      setPartnerNavigationError('Combined-farm PIN or enrolment year is missing.');
      return;
    }

    setOpeningPartnerPin(combinedFarmPin);
    setPartnerNavigationError(null);
    try {
      const combinedFarmEnrolmentId = await resolvePartnerEnrolmentId(combinedFarmPin, programYear);
      if (!combinedFarmEnrolmentId) {
        setPartnerNavigationError(`No ${programYear} enrolment found for combined-farm PIN ${combinedFarmPin}.`);
        return;
      }
      const route = target === 'details' ? 'enrolment' : 'calculation';
      void openInNewTab(`#/${route}/${routeSource}/${combinedFarmEnrolmentId}`);
    } catch (err) {
      const fallback = target === 'details'
        ? 'Unable to open combined-farm enrolment.'
        : 'Unable to open combined-farm calculation.';
      setPartnerNavigationError(err instanceof Error ? err.message : fallback);
    } finally {
      setOpeningPartnerPin(null);
    }
  };

  const handleOpenCombinedFarmEnrolment = (combinedFarm: CombinedFarmSummary) => (
    openCombinedFarmEnrolment(combinedFarm, 'details')
  );

  const handleOpenCombinedFarmCalculation = (combinedFarm: CombinedFarmSummary) => (
    openCombinedFarmEnrolment(combinedFarm, 'calculation')
  );

  const handleOpenCombinedFarmAccount = (combinedFarm: CombinedFarmSummary) => {
    if (!combinedFarm.participantAccountId) {
      setPartnerNavigationError(`No CORE account found for combined-farm PIN ${combinedFarm.participantPin}.`);
      return;
    }
    setPartnerNavigationError(null);
    const appId = coreAppId?.trim() || CORE_APP_ID_FALLBACK;
    const baseUrl = coreBaseUrl?.trim() || CORE_BASE_URL_FALLBACK;
    const href = buildCoreEntityRecordHref(baseUrl, appId, 'account', combinedFarm.participantAccountId);
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const handleOpenPartnerAccount = async (row: PartnerComparisonRow) => {
    const partnerPin = row.partnerParticipantPin.trim();
    if (!partnerPin) {
      setPartnerNavigationError('Partner PIN is missing.');
      return;
    }

    setOpeningPartnerPin(partnerPin);
    setPartnerNavigationError(null);
    try {
      const accountId = row.partnerAccountId || await resolvePartnerAccountId(partnerPin);
      if (!accountId) {
        setPartnerNavigationError(`No CORE account found for partner PIN ${partnerPin}.`);
        return;
      }
      const appId = coreAppId?.trim() || CORE_APP_ID_FALLBACK;
      const baseUrl = coreBaseUrl?.trim() || CORE_BASE_URL_FALLBACK;
      const href = buildCoreEntityRecordHref(baseUrl, appId, 'account', accountId);
      window.open(href, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setPartnerNavigationError(err instanceof Error ? err.message : 'Unable to open partner account.');
    } finally {
      setOpeningPartnerPin(null);
    }
  };

  const handleOpenPartnerDetails = async (row: PartnerComparisonRow) => {
    await openPartnerEnrolment(row, 'details');
  };

  const handleOpenPartnerCalculation = async (row: PartnerComparisonRow) => {
    await openPartnerEnrolment(row, 'calculation');
  };

  const handle45DayPause = async () => {
    if (!record || !resolvedEnrolmentId) return;
    setCounterActionLoading(true);
    setCounterActionError(null);
    try {
      const today = new Date().toISOString();
      const patch: Partial<Vsi_participantprogramyears> = {
        vsi_fortyfivedaycounterpaused: true,
        vsi_fortyfivedaypausedate: today,
      };
      const result = await Vsi_participantprogramyearsService.update(resolvedEnrolmentId, patch);
      if (!result.success) throw new Error(result.error?.message ?? 'Failed to pause counter.');
      setRecord(prev => prev ? { ...prev, ...patch } : prev);
      patchEnrolmentCache([{ id: resolvedEnrolmentId, fields: patch }]);
    } catch (err) {
      setCounterActionError(err instanceof Error ? err.message : 'Failed to pause counter.');
    } finally {
      setCounterActionLoading(false);
    }
  };

  const handle45DayResume = async () => {
    if (!record || !resolvedEnrolmentId) return;
    setCounterActionLoading(true);
    setCounterActionError(null);
    try {
      const pauseDate = record.vsi_fortyfivedaypausedate;
      const startDate = record.vsi_fortyfivedayletterstartdate;
      if (!pauseDate || !startDate) throw new Error('Cannot resume: pause date or start date is missing.');
      // Calculate how many days had elapsed at the moment the counter was paused,
      // then anchor the new start date that many days before now.  This preserves
      // the frozen elapsed count exactly, regardless of how long the pause lasted.
      const elapsedAtPause = Math.floor(
        (new Date(pauseDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      const newStartDate = new Date(Date.now() - elapsedAtPause * 24 * 60 * 60 * 1000).toISOString();
      const resumeResult = await Vsi_participantprogramyearsService.update(
        resolvedEnrolmentId,
        {
          vsi_fortyfivedaycounterpaused: false,
          vsi_fortyfivedayletterstartdate: newStartDate,
          vsi_fortyfivedaypausedate: null,
        } as unknown as Parameters<typeof Vsi_participantprogramyearsService.update>[1],
      );
      if (!resumeResult.success) throw new Error(resumeResult.error?.message ?? 'Failed to resume counter.');
      const patch: Partial<Vsi_participantprogramyears> = {
        vsi_fortyfivedaycounterpaused: false,
        vsi_fortyfivedaypausedate: undefined,
        vsi_fortyfivedayletterstartdate: newStartDate,
      };
      setRecord(prev => prev ? { ...prev, ...patch } : prev);
      patchEnrolmentCache([{ id: resolvedEnrolmentId, fields: patch }]);
    } catch (err) {
      setCounterActionError(err instanceof Error ? err.message : 'Failed to resume counter.');
    } finally {
      setCounterActionLoading(false);
    }
  };

  const handleCompleteConfirm = async () => {
    if (!record || !resolvedEnrolmentId) return;
    setCompleting(true);
    setError(null);
    try {
      const currentUser = await resolveCurrentSystemUser();
      const result = await ProcessEnrolmentActionService.Run({ text: resolvedEnrolmentId, text_1: 'complete', text_2: currentUser.systemUserId });
      if (!result.success) {
        const msg = (result.error as { message?: string } | undefined)?.message ?? `Failed to complete ${resolvedEnrolmentId}.`;
        throw new Error(msg);
      }
      const flowMessage = result.data?.message;
      if (flowMessage && flowMessage.toLowerCase() !== 'success') {
        throw new Error(flowMessage);
      }
      const completedFields: Partial<Vsi_participantprogramyears> = {
        vsi_taskstatus: 865520002 as unknown as Vsi_participantprogramyears['vsi_taskstatus'],
        vsi_enrolmentstatus: 865520006 as unknown as Vsi_participantprogramyears['vsi_enrolmentstatus'],
      };
      patchEnrolmentCache([{ id: resolvedEnrolmentId, fields: completedFields }]);
      setRecord(prev => prev ? { ...prev, ...completedFields } : prev);
      setShowCompleteConfirm(false);
      setRefreshKey(prev => prev + 1);
      clearEnrolmentCache();
      clearSaCache();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Complete failed.');
    } finally {
      setCompleting(false);
    }
  };

  const handleApproveClick = async () => {
    if (!record) return;

    try {
      const approvalError = getApprovalError(record);
      if (approvalError) {
        setApprovalErrorModal(approvalError);
        return;
      }

      setShowApproveConfirm(true);
    } catch (err) {
      setApprovalErrorModal(err instanceof Error ? err.message : 'Unable to validate approval.');
    }
  };

  const handleApproveConfirm = async () => {
    if (!record || !resolvedEnrolmentId) return;

    setApproving(true);
    setError(null);
    try {
      const approvalError = getApprovalError(record);
      if (approvalError) {
        setShowApproveConfirm(false);
        setApprovalErrorModal(approvalError);
        return;
      }

      const currentUser = await resolveCurrentSystemUser();
      const result = await ProcessEnrolmentActionService.Run({ text: resolvedEnrolmentId, text_1: 'approve', text_2: currentUser.systemUserId });
      if (!result.success) {
        const msg = (result.error as { message?: string } | undefined)?.message ?? 'Failed to approve enrolment';
        throw new Error(msg);
      }
      const flowMessage = result.data?.message;
      if (flowMessage && flowMessage.toLowerCase() !== 'success') {
        throw new Error(flowMessage);
      }

      const approvedFields: Partial<Vsi_participantprogramyears> = {
        vsi_taskstatus: 865520003 as unknown as Vsi_participantprogramyears['vsi_taskstatus'],
      };
      patchEnrolmentCache([{ id: resolvedEnrolmentId, fields: approvedFields }]);
      if (routeSource === 'supervisor') removeSaItemsFromCache([resolvedEnrolmentId]);
      setRecord(prev => prev ? { ...prev, ...approvedFields } : prev);
      setShowApproveConfirm(false);
      setRefreshKey(prev => prev + 1);
      clearEnrolmentCache();
      clearSaCache();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed.');
    } finally {
      setApproving(false);
    }
  };


  return (
    <section className="page-card calc-page">
      <div className="calc-title-row">
        <button type="button" className="calc-back-btn" onClick={() => navigate(backTo)}>{backLabel}</button>
        <span className="calc-page-label">Enrolment App / FARMS Calculation</span>
        {(record || loading) && (
          <div className="details-meta-strip">
            <div className="details-info-card">
              <div className="details-info-stats-row">
                <div className="details-info-stat">
                  <span className="details-info-value">
                    <span>
                      {record?.vsi_isnewparticipant != null ? (record.vsi_isnewparticipant ? 'Yes' : 'No') : (loading ? '...' : '—')}
                    </span>
                  </span>
                  <span className="details-info-label">NPP</span>
                </div>
                <div className="details-info-stat-divider" />
                <div className="details-info-stat">
                  <span className="details-info-value">{taskStatusLabel || (loading ? '...' : '—')}</span>
                  <span className="details-info-label">Task Status</span>
                </div>
                <div className="details-info-stat-divider" />
                <div className="details-info-stat">
                  <span className="details-info-value details-info-owner-value">
                    <span
                      className="avatar-circle"
                      style={{ background: getAvatarColor(ownerName || ''), flexShrink: 0 }}
                      aria-hidden="true"
                    >
                      {getInitials(ownerName || '')}
                    </span>
                    {ownerName || (loading ? '...' : '—')}
                  </span>
                  <span className="details-info-label">Owner</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="calc-identity">
        <Link to={`/enrolment/${routeSource}/${resolvedEnrolmentId}`} className="calc-enrolment-name-link">
          {record?.vsi_name ?? (loading ? 'Loading...' : '-')}
        </Link>
        {participantHref
          ? <a className="details-participant-name" href={participantHref} target="_blank" rel="noopener noreferrer">{participantName || (loading ? 'Loading...' : '-')}</a>
          : <span className="details-participant-name">{participantName || (loading ? 'Loading...' : '-')}</span>
        }
      </div>

      <div className="calc-toolbar">
        <button className="calc-outline-btn" type="button" onClick={() => setShow45DayModal(true)}>Send 45-Day Letter</button>
        <button
          className="calc-outline-btn"
          type="button"
          onClick={() => setRefreshKey(prev => prev + 1)}
          disabled={loading}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
        <div className="calc-toolbar-gap" />
        {farmsScenarioUrl ? (
          <a
            className="calc-outline-btn calc-sharepoint-btn"
            href={farmsScenarioUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={14} aria-hidden="true" />
            Open a Scenario in FARMS
          </a>
        ) : (
          <button
            className="calc-outline-btn calc-sharepoint-btn"
            type="button"
            disabled
            title={loading || participantPinLoading || farmsLegacyBaseUrlLoading ? 'Loading FARMS scenario link' : 'FARMS URL, PIN, or program year is missing for this enrolment'}
          >
            <ExternalLink size={14} aria-hidden="true" />
            Open a Scenario in FARMS
          </button>
        )}
        {sharePointFolderUrl ? (
          <a
            className="calc-outline-btn calc-sharepoint-btn"
            href={sharePointFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src={sharepointIconUrl} className="calc-sharepoint-icon" alt="" aria-hidden="true" />
            Go to SharePoint
          </a>
        ) : (
          <button
            className="calc-outline-btn calc-sharepoint-btn"
            type="button"
            disabled
            title={loading ? 'Loading SharePoint folder link' : 'No SharePoint folder link found for this enrolment'}
          >
            <img src={sharepointIconUrl} className="calc-sharepoint-icon" alt="" aria-hidden="true" />
            Go to SharePoint
          </button>
        )}
      </div>

      {record && record.vsi_enrolmentstatus === 865520010 && (() => {
        const startDate = record.vsi_fortyfivedayletterstartdate;
        const paused = !!record.vsi_fortyfivedaycounterpaused;
        const pauseDate = record.vsi_fortyfivedaypausedate;
        const referenceMs = paused && pauseDate ? new Date(pauseDate).getTime() : Date.now();
        const elapsedDays = startDate
          ? Math.floor((referenceMs - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const remainingDays = elapsedDays !== null ? 45 - elapsedDays : null;
        return (
          <div className="calc-fortyfiveday-card" aria-label="45-day letter counter">
            <div className="calc-fortyfiveday-title">45-Day Counter</div>
            <div className="calc-fortyfiveday-grid">
              <div>
                <div className="calc-fortyfiveday-label">Start Date</div>
                <div className="calc-fortyfiveday-value">{startDate ? new Date(startDate).toLocaleDateString() : '-'}</div>
              </div>
              <div>
                <div className="calc-fortyfiveday-label">Elapsed</div>
                <div className="calc-fortyfiveday-value">{elapsedDays !== null ? `${elapsedDays} / 45 days` : '-'}</div>
              </div>
              <div>
                <div className="calc-fortyfiveday-label">Remaining</div>
                <div className={`calc-fortyfiveday-value${remainingDays !== null && remainingDays <= 10 && !paused ? ' calc-fortyfiveday-warning' : ''}`}>
                  {remainingDays !== null ? `${remainingDays} days` : '-'}
                </div>
              </div>
              <div>
                <div className="calc-fortyfiveday-label">Status</div>
                <div className="calc-fortyfiveday-value">
                  {paused
                    ? <span className="fortyfiveday-badge fortyfiveday-badge-paused">⏸ Paused{pauseDate ? ` since ${new Date(pauseDate).toLocaleDateString()}` : ''}</span>
                    : <span className="fortyfiveday-badge fortyfiveday-badge-running">▶ Running</span>}
                </div>
              </div>
            </div>
            <div className="calc-fortyfiveday-actions">
              {paused ? (
                <button
                  className="calc-outline-btn"
                  type="button"
                  onClick={() => void handle45DayResume()}
                  disabled={counterActionLoading}
                >
                  {counterActionLoading ? 'Resuming...' : 'Resume Counter'}
                </button>
              ) : (
                <button
                  className="calc-outline-btn"
                  type="button"
                  onClick={() => void handle45DayPause()}
                  disabled={counterActionLoading}
                >
                  {counterActionLoading ? 'Pausing...' : 'Pause Counter'}
                </button>
              )}
            </div>
            {counterActionError && <p className="calc-fortyfiveday-error">{counterActionError}</p>}
          </div>
        );
      })()}

      {loading && <p className="calc-state">Loading summary...</p>}
      {error && <p className="calc-state calc-state-error">Error loading summary: {error}</p>}
      {farmsWorkflowCalculationLoading && <p className="calc-state">Loading FARMS enrolment calculation...</p>}
      {farmsWorkflowCalculationError && <p className="calc-state calc-state-error">{farmsWorkflowCalculationError}</p>}

      {!loading && !error && record && (
        <div className={`calc-workspace${partnerPanelPinned || historicalPanelPinned ? ' calc-workspace-panel-pinned' : ''}`}>
          <div className="calc-legacy-workflow" aria-label="FARMS enrolment calculation">
            <CalculationErrorMessages messages={tableErrors.unmatched} />

            <section className="calc-legacy-panel" aria-label="Enrolment fee">
              <h2 className="calc-legacy-title">Enrolment Fee</h2>
              <CalculationErrorMessages messages={tableErrors.enrolmentFee} />
              <div className="calc-legacy-table-wrap">
                <table className="calc-legacy-table calc-legacy-table-compact">
                  <thead>
                    <tr>
                      <th scope="col">Contribution Margin</th>
                      <th scope="col">Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{formatCurrencyBlank(farmsEnrolment?.contributionMargin ?? record.vsi_contributionmargin)}</td>
                      <td>{formatCurrencyBlank(farmsEnrolment?.enrolmentFee ?? record.vsi_enrolmentfee)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

          <section className="calc-legacy-panel" aria-label="Benefit margin calculation">
            <CalculationOption checked={!calculationTypeCode || calculationTypeCode === 'BENEFIT'} label="Calculate using Benefit Margins" />
            <h2 className="calc-benefit-title">Production Margins after Structural Change</h2>
            <CalculationErrorMessages messages={tableErrors.benefit} />

            <div className="calc-legacy-table-wrap">
              <table className="calc-legacy-table calc-benefit-table">
                <thead>
                  <tr>
                    <th scope="col"></th>
                    {benefitMarginRows.map(item => (
                      <th key={item.label} scope="col">{item.label}</th>
                    ))}
                    <th scope="col">Contribution Margin</th>
                    <th scope="col">Enrolment Fee</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Margin</th>
                    {benefitMarginRows.map(item => (
                      <td key={item.label}>{formatCurrencyBlank(item.margin)}</td>
                    ))}
                    <td>{formatCurrencyBlank(farmsEnrolment?.benefitContributionMargin ?? record.vsi_contributionmargin)}</td>
                    <td>{formatCurrencyBlank(farmsEnrolment?.benefitEnrolmentFee ?? record.vsi_enrolmentfee)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Used In Calculation</th>
                    {benefitMarginRows.map(item => (
                      <td key={item.label}>{getBooleanText(item.used)}</td>
                    ))}
                    <td></td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="calc-legacy-panel" aria-label="Proxy margin calculation">
            <CalculationOption checked={calculationTypeCode === 'PROXY'} label="Calculate using Proxy Margins" />
            <h2 className="calc-benefit-title">Program Year Productive Value</h2>
            <CalculationErrorMessages messages={tableErrors.proxy} />
            <div className="calc-legacy-table-wrap">
              <table className="calc-legacy-table calc-proxy-table">
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Description</th>
                    <th scope="col">Productive Capacity</th>
                    {proxyYears.map(year => (
                      <Fragment key={year}>
                        <th scope="col">{year} BPU</th>
                        <th scope="col">{year} Margin</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(farmsEnrolment?.enwProductiveUnits?.length ? farmsEnrolment.enwProductiveUnits : [null]).map((unit, rowIndex) => (
                    <tr key={unit?.code ?? `blank-productive-unit-${rowIndex}`}>
                      <th scope="row">{unit?.code ?? ''}</th>
                      <td className="calc-legacy-text-cell">{unit?.description ?? ''}</td>
                      <td>{formatNumberOrBlank(unit?.productiveCapacity, 3)}</td>
                      {proxyYears.map((year, yearIndex) => {
                        const productiveValue = unit?.productiveValues?.[yearIndex];
                        return (
                          <Fragment key={`${unit?.code ?? rowIndex}-${year}`}>
                            <td>{formatCurrencyBlank(productiveValue?.bpuMargin)}</td>
                            <td>{formatCurrencyBlank(productiveValue?.productiveValue)}</td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row">Total</th>
                    <td></td>
                    <td></td>
                    {proxyYears.map((year, yearIndex) => (
                      <Fragment key={`${year}-total`}>
                        <td></td>
                        <td>{formatCurrencyBlank(farmsEnrolment?.proxyMargins?.[yearIndex])}</td>
                      </Fragment>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="calc-legacy-table-wrap">
              <table className="calc-legacy-table calc-legacy-table-compact">
                <thead>
                  <tr>
                    {proxyYears.map(year => (
                      <th key={year} scope="col">{year}</th>
                    ))}
                    <th scope="col">Contribution Margin</th>
                    <th scope="col">Enrolment Fee</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {proxyYears.map((year, index) => (
                      <td key={year}>{formatCurrencyBlank(farmsEnrolment?.proxyMargins?.[index])}</td>
                    ))}
                    <td>{formatCurrencyBlank(farmsEnrolment?.proxyContributionMargin)}</td>
                    <td>{formatCurrencyBlank(farmsEnrolment?.proxyEnrolmentFee)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="calc-legacy-panel" aria-label="Manual margin calculation">
            <CalculationOption checked={calculationTypeCode === 'MANUAL'} label="Calculate using Manually Entered Margins" />
            <CalculationErrorMessages messages={tableErrors.manual} />
            <div className="calc-legacy-table-wrap">
              <table className="calc-legacy-table calc-manual-table">
                <thead>
                  <tr>
                    {proxyYears.map(year => (
                      <th key={year} scope="col">{year}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {proxyYears.map((year, index) => (
                      <td key={year}>
                        <span className="calc-manual-input">{formatCurrencyBlank(manualMargins[index])}</span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="calc-legacy-table-wrap">
              <table className="calc-legacy-table calc-legacy-table-compact">
                <thead>
                  <tr>
                    <th scope="col">Contribution Margin</th>
                    <th scope="col">Enrolment Fee</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{formatCurrencyBlank(farmsEnrolment?.manualContributionMargin)}</td>
                    <td>{formatCurrencyBlank(farmsEnrolment?.manualEnrolmentFee)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className="calc-approval-row">
            <button
              className="calc-outline-btn"
              type="button"
              onClick={() => setShowSupervisorModal(true)}
              disabled={!record}
            >
              <Send size={14} aria-hidden="true" />
              Refer to Supervisor
            </button>
            {activeRole !== 'Verifier' && (
              <button
                className="calc-outline-btn"
                type="button"
                onClick={() => void handleApproveClick()}
                disabled={!record || approving}
              >
                <CircleCheck size={14} aria-hidden="true" />
                {approving ? 'Approving...' : 'Approve'}
              </button>
            )}
            {activeRole === 'Verifier' && (
              <button
                className="calc-outline-btn"
                type="button"
                onClick={() => setShowCompleteConfirm(true)}
                disabled={!record || completing}
              >
                <CircleCheck size={14} aria-hidden="true" />
                {completing ? 'Completing...' : 'Complete'}
              </button>
            )}
          </div>
          </div>

          <div className="calc-side-panels" aria-label="Calculation comparison panels">
            <HistoricalComparisonPanel
              rows={historicalRows}
              loading={historicalRowsLoading}
              error={historicalRowsError}
              open={historicalPanelOpen}
              pinned={historicalPanelPinned}
              onToggleOpen={() => setHistoricalPanelOpen(prev => !prev)}
              onTogglePinned={() => setHistoricalPanelPinned(prev => !prev)}
            />

            <PartnerViewPanel
              rows={partnerRows}
              combinedFarms={combinedFarmRows}
              loading={partnerRowsLoading}
              error={partnerRowsError}
              enrolmentProgramYear={programYear}
              openingPartnerPin={openingPartnerPin}
              partnerNavigationError={partnerNavigationError}
              open={partnerPanelOpen}
              pinned={partnerPanelPinned}
              onToggleOpen={() => setPartnerPanelOpen(prev => !prev)}
              onTogglePinned={() => setPartnerPanelPinned(prev => !prev)}
              onOpenCombinedFarmEnrolment={handleOpenCombinedFarmEnrolment}
              onOpenCombinedFarmCalculation={handleOpenCombinedFarmCalculation}
              onOpenCombinedFarmAccount={handleOpenCombinedFarmAccount}
              onOpenPartnerAccount={handleOpenPartnerAccount}
              onOpenPartnerDetails={handleOpenPartnerDetails}
              onOpenPartnerCalculation={handleOpenPartnerCalculation}
            />
          </div>
        </div>
      )}

      {showSupervisorModal && record && (
        <ReferToSupervisorModal
          selectedIds={new Set([record.vsi_participantprogramyearid])}
          rows={[record]}
          onClose={() => setShowSupervisorModal(false)}
          onComplete={() => {
            setRecord(prev => prev ? { ...prev, vsi_taskstatus: 865520001 } : prev);
            setRefreshKey(prev => prev + 1);
          }}
          onError={(message) => setError(message)}
        />
      )}
      {approvalErrorModal && (
        <ApprovalErrorModal message={approvalErrorModal} onClose={() => setApprovalErrorModal(null)} />
      )}
      {letterSentMessage && (
        <p className="calc-state" style={{ color: '#16a34a' }}>{letterSentMessage}</p>
      )}
      {show45DayModal && (
        <Send45DayLetterModal
          enrolmentId={resolvedEnrolmentId}
          enrolmentName={record?.vsi_name ?? ''}
          programYear={String(getProgramYear(record) ?? '')}
          onClose={() => setShow45DayModal(false)}
          onSuccess={() => setLetterSentMessage('45-day letter sent successfully.')}
        />
      )}
      {showApproveConfirm && record && (
        <ConfirmActionModal
          title="Confirm Approve Enrolments"
          message="Are you sure you want to approve the selected 1 enrolment?"
          enrolments={[{ id: record.vsi_participantprogramyearid, name: record.vsi_name ?? '' }]}
          confirmLabel="Approve"
          cancelLabel="Cancel"
          loading={approving}
          onConfirm={() => void handleApproveConfirm()}
          onCancel={() => setShowApproveConfirm(false)}
        />
      )}
      {showCompleteConfirm && record && (
        <ConfirmActionModal
          title="Confirm Complete Enrolment"
          message="This will set the task status to Ready and the enrolment status to Verified EN Calculated. Continue?"
          enrolments={[{ id: record.vsi_participantprogramyearid, name: record.vsi_name ?? '' }]}
          confirmLabel="Complete"
          cancelLabel="Cancel"
          loading={completing}
          onConfirm={() => void handleCompleteConfirm()}
          onCancel={() => setShowCompleteConfirm(false)}
        />
      )}
    </section>
  );
}