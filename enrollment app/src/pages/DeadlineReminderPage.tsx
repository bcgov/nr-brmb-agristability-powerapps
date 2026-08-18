import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { CORE_APP_ID_FALLBACK, CORE_BASE_URL_FALLBACK } from '../constants/config';
import { getCoreConfig } from '../hooks/useEnrolmentData';
import { Vsi_automaticemailauditsService } from '../generated/services/Vsi_automaticemailauditsService';
import { Vsi_armsconfigurationsService } from '../generated/services/Vsi_armsconfigurationsService';
import { formatCurrencyOr, formatEnrolmentStatusDisplay, getEnrolmentStatusLabel } from '../utils/helpers';
import { formatDateOnlyForDisplay } from '../utils/date';
import { ColumnHeaderMenu } from '../components/ColumnHeaderMenu';
import type { SortDir, FilterOperator } from '../types/enrollment';
import { getReminderRemainingDays, hasEnrolmentNoticeSentDate, resolveReminderKind, shouldIncludeReminderRow, type ReminderKind } from './deadlineReminderUtils';
import { SendEmailwithTemplateService } from '../generated/services/SendEmailwithTemplateService';
import { EnvironmentvariablevaluesService } from '../generated/services/EnvironmentvariablevaluesService';
import { Toast, nextToastId } from '../components/Toast';
import type { ToastMessage } from '../components/Toast';
import { useRole } from '../context/RoleContext';
import '../styles/supervisor-approval.css';

type DeadlineColumnKey = 'enrolmentName' | 'year' | 'participant' | 'pin' | 'enrolmentStatus' | 'totalFeesOwed' | 'noticeSentDate' | 'deadlineDate' | 'remainingDays' | 'kind' | 'reminderSent';

function getParticipantPinFromEnrolmentName(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  if (!text) return '';
  const numericTokens = text.match(/\b\d{4,}\b/g);
  return numericTokens?.at(-1) ?? '';
}

type DeadlineReminderRow = {
  item: Vsi_participantprogramyears;
  itemId: string;
  participantId?: string;
  participantName: string;
  participantPin: string;
  year: string;
  enrolmentStatusLabel: string;
  totalFeesOwed: number | null;
  noticeSentDate?: string;
  deadlineDate?: string;
  remainingDays: number | null;
  reminderSent: boolean | null;
  kind: ReminderKind;
};

const EN_STATUS_ENROLMENT_NOTICE_SENT = 865520007;
const EN_STATUS_ENROLLED_NOT_PAID = 865520008;
const AUTOMATIC_EMAIL_TYPE = { NonPenaltyReminder: 865520001, FinalDeadlineReminder: 865520002, LateEnrolmentReminder: 865520007 } as const;
const AUTOMATIC_EMAIL_SENDSTATUS_SENT = 865520001;
const PAGE_SIZE = 20;

type PaginationPage = number | '...';

const getPaginationPages = (currentPage: number, totalPages: number): PaginationPage[] => {
  const pages: PaginationPage[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i += 1) pages.push(i);
    return pages;
  }

  pages.push(1);
  let start = Math.max(2, currentPage - 1);
  let end = Math.min(totalPages - 1, currentPage + 1);

  if (end - start < 2) {
    if (start === 2) end = Math.min(totalPages - 1, start + 2);
    else start = Math.max(2, end - 2);
  }

  if (start > 2) pages.push('...');
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < totalPages - 1) pages.push('...');
  pages.push(totalPages);
  return pages;
};

const normalizeGuid = (value?: string | null) => (value ?? '').replace(/[{}]/g, '').trim().toLowerCase();

const formatDate = (value?: string) => {
  if (!value) return '-';
  const formatted = formatDateOnlyForDisplay(value);
  return formatted || '-';
};

const formatDays = (value: number | null) => {
  if (value == null) return '-';
  if (value === 0) return '0';
  if (value < 0) return `${value} day${Math.abs(value) === 1 ? '' : 's'}`;
  return `${value} day${value === 1 ? '' : 's'}`;
};

const yesNoText = (value: boolean | null) => {
  if (value == null) return '-';
  return value ? 'Yes' : 'No';
};

const getDisplayValue = (item: Vsi_participantprogramyears, annotationKey: string, fallback?: string) => {
  const raw = item as unknown as Record<string, unknown>;
  return (raw[annotationKey] as string | undefined) ?? fallback ?? '-';
};

type AuditMap = Map<string, { nonPenalty: boolean; finalDeadline: boolean; lateFinalDeadline: boolean }>;

const toReminderRow = (item: Vsi_participantprogramyears, auditMap: AuditMap | null): DeadlineReminderRow | null => {
  const itemId = normalizeGuid(item.vsi_participantprogramyearid);
  if (!itemId) return null;

  const status = Number(item.vsi_enrolmentstatus);
  const kind = resolveReminderKind(status, hasEnrolmentNoticeSentDate(item.vsi_lateenrolmentnoticesentdate));
  if (kind == null) return null;

  const noticeSentDate = kind === 'lateFinalDeadline'
    ? item.vsi_lateenrolmentnoticesentdate
    : item.vsi_enrolmentnoticesentdate;
  if (!hasEnrolmentNoticeSentDate(noticeSentDate)) return null;

  const deadlineDate = kind === 'nonPenalty'
    ? item.vsi_enrolmentfeesnonpenaltyduedate
    : kind === 'finalDeadline'
      ? item.vsi_enrolmentfeesfinaldeadlinedate
      : item.vsi_lateenrolmentfeesfinaldeadlinedate;
  const remainingDays = getReminderRemainingDays(
    kind,
    item.vsi_nonpenaltydeadlinedaysleft,
    item.vsi_finaldeadlinedaysdiff,
    item.vsi_latefinaldeadlinedaysdiff,
  );
  if (remainingDays == null) return null;

  let reminderSent: boolean | null;
  if (auditMap) {
    const audits = auditMap.get(itemId);
    reminderSent = kind === 'nonPenalty'
      ? (audits?.nonPenalty ?? false)
      : kind === 'finalDeadline'
        ? (audits?.finalDeadline ?? false)
        : (audits?.lateFinalDeadline ?? false);
  } else {
    // Fallback to boolean fields while audit data is loading
    reminderSent = kind === 'nonPenalty'
      ? item.vsi_nonpenaltydeadlineremindersent ?? null
      : kind === 'finalDeadline'
        ? item.vsi_finaldeadlineremindersent ?? null
        : item.vsi_latefinaldeadlineremindersent ?? null;
  }

  return {
    item,
    itemId,
    participantId: item._vsi_participantid_value,
    participantName: getDisplayValue(item, '_vsi_participantid_value@OData.Community.Display.V1.FormattedValue', item.vsi_participantidname),
    participantPin: getParticipantPinFromEnrolmentName(item.vsi_name),
    year: getDisplayValue(item, '_vsi_programyearid_value@OData.Community.Display.V1.FormattedValue', item.vsi_programyearidname),
    enrolmentStatusLabel: getEnrolmentStatusLabel(item.vsi_enrolmentstatus) || '-',
    totalFeesOwed: item.vsi_totalfeesowed ?? item.vsi_totalfeesowedcalculated ?? null,
    noticeSentDate,
    deadlineDate,
    remainingDays,
    reminderSent,
    kind,
  };
};

export function DeadlineReminderPage() {
  const { activeRole } = useRole();
  const canEditConfig = activeRole === 'SystemAdmin' || activeRole === 'ENAdmin';
  const [items, setItems] = useState<Vsi_participantprogramyears[]>([]);
  const [auditMap, setAuditMap] = useState<AuditMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<DeadlineColumnKey>('remainingDays');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showUrgentOnly, setShowUrgentOnly] = useState(false);
  const [enrolStatusColFilter, setEnrolStatusColFilter] = useState<Set<string>>(new Set());
  const [enrolStatusColFilterOp, setEnrolStatusColFilterOp] = useState<FilterOperator>('equals');
  const [yearColFilter, setYearColFilter] = useState<Set<string>>(new Set());
  const [yearColFilterOp, setYearColFilterOp] = useState<FilterOperator>('equals');
  const [reminderSentColFilter, setReminderSentColFilter] = useState<Set<string>>(new Set());
  const [urgentDaysThreshold, setUrgentDaysThreshold] = useState(5);
  const [sendEmailDaysThreshold, setSendEmailDaysThreshold] = useState(30);
  const [configRowId, setConfigRowId] = useState<string | null>(null);
  const [configUnsaved, setConfigUnsaved] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await Vsi_armsconfigurationsService.getAll({
        maxPageSize: 50,
        orderBy: ['modifiedon desc'],
        select: ['vsi_armsconfigurationid', 'vsi_activeconfiguration', 'vsi_urgentreminderdays', 'vsi_allowreminderdays'],
      });
      const rows = result.data ?? [];
      const active = rows.find(r => r.vsi_activeconfiguration) ?? rows[0];
      if (!active) return;
      setConfigRowId(active.vsi_armsconfigurationid ?? null);
      const urgent = active.vsi_urgentreminderdays;
      const allow = active.vsi_allowreminderdays;
      if (urgent != null) setUrgentDaysThreshold(urgent);
      if (allow != null) setSendEmailDaysThreshold(allow);
      setConfigUnsaved(urgent == null || allow == null);
    })();
  }, []);

  const handleSaveConfig = async () => {
    if (!configRowId) return;
    setConfigSaving(true);
    try {
      const result = await Vsi_armsconfigurationsService.update(configRowId, {
        vsi_urgentreminderdays: urgentDaysThreshold,
        vsi_allowreminderdays: sendEmailDaysThreshold,
      });
      if (!result.success) throw new Error((result.error as { message?: string } | undefined)?.message ?? 'Save failed');
      setConfigUnsaved(false);
      addToast('Configuration saved.');
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setConfigSaving(false);
    }
  };
  const [sendingEmailFor, setSendingEmailFor] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (message: string, type: ToastMessage['type'] = 'success') =>
    setToasts(prev => [...prev, { id: nextToastId(), message, type }]);
  const dismissToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));
  const [nonPenaltyTemplateGuid, setNonPenaltyTemplateGuid] = useState<string>('');
  const [finalDeadlineTemplateGuid, setFinalDeadlineTemplateGuid] = useState<string>('');
  const [lateEnTemplateGuid, setLateEnTemplateGuid] = useState<string>('');
  const [envVarsLoaded, setEnvVarsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await EnvironmentvariablevaluesService.getAll({
          select: ['schemaname', 'value'],
          maxPageSize: 100,
        });
        for (const row of result.data ?? []) {
          const schema = row.schemaname as string | undefined;
          const val = (row.value as string | undefined) ?? '';
          if (schema === 'vsi_ENDeadlineReminderEmailTemplate') setNonPenaltyTemplateGuid(val);
          if (schema === 'vsi_ENFeeFinalDeadlineReminderTemplate') setFinalDeadlineTemplateGuid(val);
          if (schema === 'vsi_LateENFeeFinalDeadlineReminderTemplate') setLateEnTemplateGuid(val);
        }
        setEnvVarsLoaded(true);
      } catch (err) {
        console.error('[DeadlineReminder] Env var fetch error:', err);
      }
    })();
  }, []);

  const handleSendNow = async (row: DeadlineReminderRow) => {
    setSendingEmailFor(prev => new Set(prev).add(row.itemId));
    try {
      const raw = row.item as unknown as Record<string, unknown>;
      const templateGuid = row.kind === 'finalDeadline'
        ? finalDeadlineTemplateGuid
        : row.kind === 'lateFinalDeadline'
          ? lateEnTemplateGuid
          : nonPenaltyTemplateGuid;
      const params = {
        text:   'vsi_participantprogramyear',
        text_1: templateGuid,
        text_2: (raw['_vsi_participantid_value'] as string | undefined) ?? '',
        text_3: row.itemId,
        text_4: row.itemId,
        text_5: (raw['_vsi_programyearid_value'] as string | undefined) ?? '',
      };
      const result = await SendEmailwithTemplateService.Run(params);
      if (!result.success) {
        throw new Error((result.error as { message?: string } | undefined)?.message ?? 'Failed to send email');
      }
      const flowResponse = (result.data as { response?: string } | undefined)?.response;
      const successResponses = ['success', 'email sent'];
      if (flowResponse && !successResponses.includes(flowResponse.toLowerCase())) {
        throw new Error(`Flow responded with: ${flowResponse}`);
      }
      addToast('Reminder email sent successfully.');
      setRefreshCounter(prev => prev + 1);
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSendingEmailFor(prev => { const next = new Set(prev); next.delete(row.itemId); return next; });
    }
  };

  const onSort = (key: DeadlineColumnKey, dir: SortDir) => { setSortKey(key); setSortDir(dir); setPage(1); };
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const noopWidthChange = () => {};

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setAuditMap(null);
        setItems([]);
        const [result, auditResult] = await Promise.all([
          Vsi_participantprogramyearsService.getAll({
          select: [
            'vsi_name',
            '_vsi_participantid_value',
            '_vsi_programyearid_value',
            'vsi_enrolmentstatus',
            'vsi_totalfeesowed',
            'vsi_totalfeesowedcalculated',
            'vsi_enrolmentnoticesentdate',
            'vsi_enrolmentfeesnonpenaltyduedate',
            'vsi_enrolmentfeesfinaldeadlinedate',
            'vsi_lateenrolmentnoticesentdate',
            'vsi_lateenrolmentfeesfinaldeadlinedate',
            'vsi_nonpenaltydeadlineremindersent',
            'vsi_finaldeadlineremindersent',
            'vsi_latefinaldeadlineremindersent',
            'vsi_nonpenaltydeadlinedaysleft',
            'vsi_finaldeadlinedaysdiff',
            'vsi_latefinaldeadlinedaysdiff',
          ],
          filter: `((vsi_enrolmentstatus eq ${EN_STATUS_ENROLMENT_NOTICE_SENT} and ((vsi_lateenrolmentnoticesentdate ne null and vsi_latefinaldeadlinedaysdiff ne null) or (vsi_lateenrolmentnoticesentdate eq null and vsi_enrolmentnoticesentdate ne null and vsi_nonpenaltydeadlinedaysleft ne null))) or (vsi_enrolmentstatus eq ${EN_STATUS_ENROLLED_NOT_PAID} and ((vsi_lateenrolmentnoticesentdate ne null and vsi_latefinaldeadlinedaysdiff ne null) or (vsi_lateenrolmentnoticesentdate eq null and vsi_enrolmentnoticesentdate ne null and vsi_finaldeadlinedaysdiff ne null))))`,
          orderBy: ['vsi_enrolmentfeesfinaldeadlinedate asc'],
          maxPageSize: 5000,
        }),
          Vsi_automaticemailauditsService.getAll({
            select: ['vsi_objectid', 'vsi_emailtype', 'vsi_sendstatus'],
            filter: `vsi_sendstatus eq ${AUTOMATIC_EMAIL_SENDSTATUS_SENT} and (vsi_emailtype eq ${AUTOMATIC_EMAIL_TYPE.NonPenaltyReminder} or vsi_emailtype eq ${AUTOMATIC_EMAIL_TYPE.FinalDeadlineReminder} or vsi_emailtype eq ${AUTOMATIC_EMAIL_TYPE.LateEnrolmentReminder})`,
            maxPageSize: 5000,
          }),
        ]);

        if (cancelled) return;
        if (!result.success) {
          setItems([]);
          setError(result.error?.message ?? 'Unable to load deadline reminders.');
          return;
        }

        // Build audit lookup map: enrolmentId → { nonPenalty, finalDeadline }
        const map: AuditMap = new Map();
        for (const audit of auditResult.data ?? []) {
          const id = normalizeGuid(audit.vsi_objectid);
          if (!id) continue;
          if (!map.has(id)) map.set(id, { nonPenalty: false, finalDeadline: false, lateFinalDeadline: false });
          const entry = map.get(id)!;
          const emailType = Number(audit.vsi_emailtype);
          if (emailType === AUTOMATIC_EMAIL_TYPE.NonPenaltyReminder) entry.nonPenalty = true;
          if (emailType === AUTOMATIC_EMAIL_TYPE.FinalDeadlineReminder) entry.finalDeadline = true;
          if (emailType === AUTOMATIC_EMAIL_TYPE.LateEnrolmentReminder) entry.lateFinalDeadline = true;
        }
        setAuditMap(map);

        setItems(result.data ?? []);
        setPage(1);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshCounter]);

  const rows = useMemo(() => {
    const mapped = items
      .map(item => toReminderRow(item, auditMap))
      .filter((row): row is DeadlineReminderRow => row !== null)
      .filter(row => shouldIncludeReminderRow(row))
      .filter(row => !(row.remainingDays === 0 && row.reminderSent === true));

    mapped.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'enrolmentName': cmp = (a.item.vsi_name ?? '').localeCompare(b.item.vsi_name ?? ''); break;
        case 'year':          cmp = a.year.localeCompare(b.year); break;
        case 'participant':   cmp = a.participantName.localeCompare(b.participantName); break;
        case 'pin':           cmp = a.participantPin.localeCompare(b.participantPin); break;
        case 'enrolmentStatus': cmp = a.enrolmentStatusLabel.localeCompare(b.enrolmentStatusLabel); break;
        case 'totalFeesOwed': cmp = (a.totalFeesOwed ?? -Infinity) - (b.totalFeesOwed ?? -Infinity); break;
        case 'noticeSentDate': cmp = (a.noticeSentDate ?? '').localeCompare(b.noticeSentDate ?? ''); break;
        case 'deadlineDate':   cmp = (a.deadlineDate ?? '').localeCompare(b.deadlineDate ?? ''); break;
        case 'remainingDays': cmp = (a.remainingDays ?? Infinity) - (b.remainingDays ?? Infinity); break;
        case 'kind':          cmp = a.kind.localeCompare(b.kind); break;
        case 'reminderSent':  cmp = Number(a.reminderSent ?? false) - Number(b.reminderSent ?? false); break;
      }
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp;
      return (a.item.vsi_name ?? '').localeCompare(b.item.vsi_name ?? '');
    });

    return mapped;
  }, [items, auditMap, sortKey, sortDir]);

  const enrolStatusOptions = useMemo(() =>
    [...new Set(rows.map(r => r.enrolmentStatusLabel))].filter(Boolean).sort(),
  [rows]);
  const yearOptions = useMemo(() =>
    [...new Set(rows.map(r => r.year))].filter(Boolean).sort(),
  [rows]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (enrolStatusColFilter.size > 0) {
      result = result.filter(r =>
        enrolStatusColFilterOp === 'equals'
          ? enrolStatusColFilter.has(r.enrolmentStatusLabel)
          : !enrolStatusColFilter.has(r.enrolmentStatusLabel)
      );
    }
    if (yearColFilter.size > 0) {
      result = result.filter(r =>
        yearColFilterOp === 'equals'
          ? yearColFilter.has(r.year)
          : !yearColFilter.has(r.year)
      );
    }
    if (reminderSentColFilter.size > 0) {
      result = result.filter(r => reminderSentColFilter.has(yesNoText(r.reminderSent)));
    }
    return result;
  }, [rows, enrolStatusColFilter, enrolStatusColFilterOp, yearColFilter, yearColFilterOp, reminderSentColFilter]);

  const enrolStatusFilterOptionLabels = useMemo(() =>
    Object.fromEntries(enrolStatusOptions.map(s => [s, formatEnrolmentStatusDisplay(s)])),
  [enrolStatusOptions]);

  const urgentRows = filteredRows.filter(r => r.remainingDays != null && r.remainingDays >= 0 && r.remainingDays <= urgentDaysThreshold);
  const displayRows = showUrgentOnly ? urgentRows : filteredRows;
  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const pageRows = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="sa-wrapper deadline-reminder-wrapper">
      <div>
        <h1 className="sa-page-title">Deadline Reminder View</h1>
        <p className="sa-page-subtitle">Monitor enrolments approaching non-penalty, penalty, and late enrolment payment deadlines.</p>
      </div>

      <div className="sa-filters-bar">
        <Link className="sa-filter-btn deadline-reminder-back-link" to="/dashboard-home">Back to Enrolments</Link>
        <button
          type="button"
          className="sa-filter-btn"
          disabled={loading}
          onClick={() => setRefreshCounter(prev => prev + 1)}
        >
          <RefreshCw size={14} />{loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="deadline-reminder-summary" aria-label="Deadline reminder summary">
        <button
          type="button"
          className={`deadline-reminder-summary-item${showUrgentOnly ? '' : ' active'}`}
          onClick={() => { setShowUrgentOnly(false); setSortKey('remainingDays'); setSortDir('asc'); setPage(1); }}
          title="Show all records"
        >
          <span className="deadline-reminder-summary-label">Total</span>
          <strong>{rows.length}</strong>
        </button>
        <button
          type="button"
          className={`deadline-reminder-summary-item urgent${showUrgentOnly ? ' active' : ''}`}
          onClick={() => { setShowUrgentOnly(true); setSortKey('remainingDays'); setSortDir('asc'); setPage(1); }}
          title={`Filter to records due within ${urgentDaysThreshold} days`}
        >
          <span className="deadline-reminder-summary-label">Due within {urgentDaysThreshold} days</span>
          <strong>{urgentRows.length}</strong>
        </button>
      </div>

      <div className="sa-card">
        <div className="sa-card-header">
          <div className="sa-card-title-block">
            <h2 className="sa-card-title">Deadline Reminders</h2>
            <p className="sa-card-subtitle">Rows turn red when the selected deadline is within {urgentDaysThreshold} days, including 0 days.</p>
          </div>
          {canEditConfig ? (
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end', flexShrink: 0 }}>
              {configUnsaved && (
                <span style={{ fontSize: '0.8rem', color: '#b45309', alignSelf: 'center' }}>
                  ⚠ Config values not set — defaults in use. Please save.
                </span>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--color-text-secondary, #6b7280)' }}>
                Urgent within (days)
                <input
                  type="number"
                  min={0}
                  value={urgentDaysThreshold}
                  onChange={e => { setUrgentDaysThreshold(Math.max(0, Number(e.target.value))); setConfigUnsaved(true); }}
                  style={{ width: '4.5rem', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--color-text-secondary, #6b7280)' }}>
                Allow send within (days)
                <input
                  type="number"
                  min={0}
                  value={sendEmailDaysThreshold}
                  onChange={e => { setSendEmailDaysThreshold(Math.max(0, Number(e.target.value))); setConfigUnsaved(true); }}
                  style={{ width: '4.5rem', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
                />
              </label>
              <button
                type="button"
                className="sa-filter-btn"
                disabled={configSaving || !configRowId}
                onClick={handleSaveConfig}
              >
                {configSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--color-text-secondary, #6b7280)' }}>
                Urgent within (days)
                <strong style={{ fontSize: '0.875rem', color: 'var(--color-text, #111827)' }}>{urgentDaysThreshold}</strong>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--color-text-secondary, #6b7280)' }}>
                Allow send within (days)
                <strong style={{ fontSize: '0.875rem', color: 'var(--color-text, #111827)' }}>{sendEmailDaysThreshold}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="sa-table-container">
          {loading && <p className="sa-state-msg loading">Loading deadline reminders...</p>}
          {error && <p className="sa-state-msg error">Error: {error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="sa-state-msg empty">No deadline reminders found.</p>
          )}
          {!loading && !error && rows.length > 0 && (
            <table className="sa-table deadline-reminder-table">
              <thead>
                <tr>
                  <ColumnHeaderMenu label="Enrolment Name"   sortKey="enrolmentName"   currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange} />
                  <ColumnHeaderMenu label="Year"             sortKey="year"             currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange}
                    filterOptions={yearOptions} selectedFilters={yearColFilter} filterOperator={yearColFilterOp}
                    onFilterChange={v => { setYearColFilter(v); setPage(1); }}
                    onFilterOperatorChange={setYearColFilterOp} />
                  <ColumnHeaderMenu label="Participant"      sortKey="participant"      currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange} />
                  <ColumnHeaderMenu label="PIN"              sortKey="pin"              currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange} />
                  <ColumnHeaderMenu label="Enrolment Status" sortKey="enrolmentStatus"  currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange}
                    filterOptions={enrolStatusOptions} filterOptionLabels={enrolStatusFilterOptionLabels}
                    selectedFilters={enrolStatusColFilter} filterOperator={enrolStatusColFilterOp}
                    onFilterChange={v => { setEnrolStatusColFilter(v); setPage(1); }}
                    onFilterOperatorChange={setEnrolStatusColFilterOp} />
                  <ColumnHeaderMenu label="Total Fees Owed"  sortLabelMode="number" sortKey="totalFeesOwed"   currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange} />
                  <ColumnHeaderMenu label="EN Notice Sent Date" sortLabelMode="date" sortKey="noticeSentDate" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange} />
                  <ColumnHeaderMenu label="Deadline Date" sortLabelMode="date" sortKey="deadlineDate" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange} />
                  <ColumnHeaderMenu label="Remaining Days Until Deadline" sortLabelMode="number" sortKey="remainingDays" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange} />
                  <ColumnHeaderMenu label="Type" sortKey="kind" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange} />
                  <ColumnHeaderMenu label="Reminder Sent"   sortKey="reminderSent"     currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange}
                    filterOptions={['Yes', 'No']} selectedFilters={reminderSentColFilter}
                    onFilterChange={v => { setReminderSentColFilter(v); setPage(1); }} />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(row => {
                  const isUrgent = row.remainingDays != null && row.remainingDays >= 0 && row.remainingDays <= urgentDaysThreshold;
                  const { coreAppId, coreBaseUrl } = getCoreConfig();
                  const participantHref = row.participantId
                    ? `${coreBaseUrl ?? CORE_BASE_URL_FALLBACK}?appid=${encodeURIComponent(coreAppId ?? CORE_APP_ID_FALLBACK)}&pagetype=entityrecord&etn=account&id=${encodeURIComponent(row.participantId)}`
                    : undefined;

                  return (
                    <tr key={row.itemId} className={isUrgent ? 'deadline-reminder-row-urgent' : undefined}>
                      <td className="sa-pin">
                        <Link className="cell-pin-link" to={`/enrolment/deadline-reminders/${row.itemId}`}>{row.item.vsi_name ?? '-'}</Link>
                      </td>
                      <td>{row.year}</td>
                      <td>
                        {participantHref
                          ? <a className="cell-pin-link" href={participantHref} target="_blank" rel="noopener noreferrer">{row.participantName}</a>
                          : row.participantName}
                      </td>
                      <td>{row.participantPin || '-'}</td>
                      <td>{formatEnrolmentStatusDisplay(row.enrolmentStatusLabel)}</td>
                      <td>{formatCurrencyOr(row.totalFeesOwed, '-')}</td>
                      <td>{formatDate(row.noticeSentDate)}</td>
                      <td>{formatDate(row.deadlineDate)}</td>
                      <td>
                        <span className={`deadline-days-pill${isUrgent ? ' urgent' : ''}`} title={row.deadlineDate ? `Deadline: ${formatDate(row.deadlineDate)}` : undefined}>
                          {formatDays(row.remainingDays)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`deadline-kind-pill deadline-kind-pill--${row.kind}`}>
                          {row.kind === 'nonPenalty' ? 'NP' : row.kind === 'finalDeadline' ? 'Final' : 'Late'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {(row.reminderSent === false || row.reminderSent === null) && row.remainingDays != null && row.remainingDays < sendEmailDaysThreshold
                          ? (
                            <>
                              <button
                                type="button"
                                className="sa-filter-btn"
                                disabled={sendingEmailFor.has(row.itemId) || !envVarsLoaded}
                                onClick={() => handleSendNow(row)}
                              >
                                {sendingEmailFor.has(row.itemId) ? 'Sending...' : 'Send Now'}
                              </button>
                            </>
                          )
                          : yesNoText(row.reminderSent)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!loading && !error && rows.length > 0 && (
          <div className="sa-pagination">
            <span>
              {`Showing ${Math.min((page - 1) * PAGE_SIZE + 1, displayRows.length)}-${Math.min(page * PAGE_SIZE, displayRows.length)} of ${displayRows.length} result${displayRows.length !== 1 ? 's' : ''}${showUrgentOnly ? ' (due within 5 days)' : ''}`}
            </span>
            <div className="sa-pagination-controls">
              <button type="button" className="sa-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                &lsaquo; Previous
              </button>
              {getPaginationPages(page, totalPages).map((p, index) => (
                p === '...'
                  ? <span key={`dots-${index}`} className="sa-page-dots">&hellip;</span>
                  : <button key={p} type="button" className={`sa-page-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>
                      {p}
                    </button>
              ))}
              <button type="button" className="sa-page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                Next &rsaquo;
              </button>
            </div>
          </div>
        )}
      </div>
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export { toReminderRow };
