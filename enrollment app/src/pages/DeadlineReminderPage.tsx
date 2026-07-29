import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { CORE_APP_ID_FALLBACK, CORE_BASE_URL_FALLBACK } from '../constants/config';
import { getCoreConfig } from '../hooks/useEnrolmentData';
import { Vsi_automaticemailauditsService } from '../generated/services/Vsi_automaticemailauditsService';
import { formatCurrencyOr, formatEnrolmentStatusDisplay, getEnrolmentStatusLabel } from '../utils/helpers';
import { ColumnHeaderMenu } from '../components/ColumnHeaderMenu';
import type { SortDir, FilterOperator } from '../types/enrollment';
import '../styles/supervisor-approval.css';

type DeadlineColumnKey = 'enrolmentName' | 'year' | 'participant' | 'pin' | 'enrolmentStatus' | 'totalFeesOwed' | 'noticeSentDate' | 'remainingDays' | 'reminderSent';

type DeadlineReminderKind = 'nonPenalty' | 'finalDeadline';

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
  kind: DeadlineReminderKind;
};

const EN_STATUS_ENROLMENT_NOTICE_SENT = 865520007;
const EN_STATUS_ENROLLED_NOT_PAID = 865520008;
const AUTOMATIC_EMAIL_TYPE = { NonPenaltyReminder: 865520001, FinalDeadlineReminder: 865520002 } as const;
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};

const formatDays = (value: number | null) => {
  if (value == null) return '-';
  if (value === 0) return '0';
  if (value < 0) return `${Math.abs(value)} day${Math.abs(value) === 1 ? '' : 's'} overdue`;
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

type AuditMap = Map<string, { nonPenalty: boolean; finalDeadline: boolean }>;

const toReminderRow = (item: Vsi_participantprogramyears, auditMap: AuditMap | null): DeadlineReminderRow | null => {
  const itemId = normalizeGuid(item.vsi_participantprogramyearid);
  if (!itemId) return null;

  const status = Number(item.vsi_enrolmentstatus);
  const isNoticeSent = status === EN_STATUS_ENROLMENT_NOTICE_SENT;
  const isEnrolledNotPaid = status === EN_STATUS_ENROLLED_NOT_PAID;
  if (!isNoticeSent && !isEnrolledNotPaid) return null;

  const deadlineDate = isNoticeSent
    ? item.vsi_enrolmentfeesnonpenaltyduedate
    : item.vsi_enrolmentfeesfinaldeadlinedate;

  let reminderSent: boolean | null;
  if (auditMap) {
    const audits = auditMap.get(itemId);
    reminderSent = isNoticeSent ? (audits?.nonPenalty ?? false) : (audits?.finalDeadline ?? false);
  } else {
    // Fallback to boolean fields while audit data is loading
    reminderSent = isNoticeSent
      ? item.vsi_nonpenaltydeadlineremindersent ?? null
      : item.vsi_finaldeadlineremindersent ?? null;
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
    noticeSentDate: item.vsi_enrolmentnoticesentdate,
    deadlineDate,
    remainingDays: isNoticeSent
      ? (item.vsi_nonpenaltydeadlinedaysleft ?? null)
      : (item.vsi_finaldeadlinedaysdiff ?? null),
    reminderSent,
    kind: isNoticeSent ? 'nonPenalty' : 'finalDeadline',
  };
};

export function DeadlineReminderPage() {
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
            'vsi_nonpenaltydeadlineremindersent',
            'vsi_finaldeadlineremindersent',
            'vsi_nonpenaltydeadlinedaysleft',
            'vsi_finaldeadlinedaysdiff',
          ],
          filter: `vsi_enrolmentstatus eq ${EN_STATUS_ENROLMENT_NOTICE_SENT} or vsi_enrolmentstatus eq ${EN_STATUS_ENROLLED_NOT_PAID}`,
          orderBy: ['vsi_enrolmentfeesfinaldeadlinedate asc'],
          maxPageSize: 5000,
        }),
          Vsi_automaticemailauditsService.getAll({
            select: ['vsi_objectid', 'vsi_emailtype', 'vsi_sendstatus'],
            filter: `vsi_sendstatus eq ${AUTOMATIC_EMAIL_SENDSTATUS_SENT} and (vsi_emailtype eq ${AUTOMATIC_EMAIL_TYPE.NonPenaltyReminder} or vsi_emailtype eq ${AUTOMATIC_EMAIL_TYPE.FinalDeadlineReminder})`,
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
          if (!map.has(id)) map.set(id, { nonPenalty: false, finalDeadline: false });
          const entry = map.get(id)!;
          const emailType = Number(audit.vsi_emailtype);
          if (emailType === AUTOMATIC_EMAIL_TYPE.NonPenaltyReminder) entry.nonPenalty = true;
          if (emailType === AUTOMATIC_EMAIL_TYPE.FinalDeadlineReminder) entry.finalDeadline = true;
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
      .filter((row): row is DeadlineReminderRow => row !== null);

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
        case 'remainingDays': cmp = (a.remainingDays ?? Infinity) - (b.remainingDays ?? Infinity); break;
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

  const urgentRows = filteredRows.filter(row => row.remainingDays != null && row.remainingDays <= 5 && row.reminderSent !== true);
  const displayRows = showUrgentOnly ? urgentRows : filteredRows;
  const totalPages = Math.max(1, Math.ceil(displayRows.length / PAGE_SIZE));
  const pageRows = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="sa-wrapper deadline-reminder-wrapper">
      <div>
        <h1 className="sa-page-title">Deadline Reminder View</h1>
        <p className="sa-page-subtitle">Monitor enrolments approaching non-penalty and penalty payment deadlines.</p>
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
          onClick={() => { setShowUrgentOnly(false); setPage(1); }}
          title="Show all records"
        >
          <span className="deadline-reminder-summary-label">Total</span>
          <strong>{rows.length}</strong>
        </button>
        <button
          type="button"
          className={`deadline-reminder-summary-item urgent${showUrgentOnly ? ' active' : ''}`}
          onClick={() => { setShowUrgentOnly(true); setSortKey('remainingDays'); setSortDir('desc'); setPage(1); }}
          title="Filter to records due within 5 days"
        >
          <span className="deadline-reminder-summary-label">Due within 5 days</span>
          <strong>{urgentRows.length}</strong>
        </button>
      </div>

      <div className="sa-card">
        <div className="sa-card-header">
          <div className="sa-card-title-block">
            <h2 className="sa-card-title">Deadline Reminders</h2>
            <p className="sa-card-subtitle">Rows turn red when the selected deadline is 5 days away or overdue and no reminder has been sent.</p>
          </div>
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
                  <ColumnHeaderMenu label="Total Fees Owed"  sortKey="totalFeesOwed"   currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange} />
                  <ColumnHeaderMenu label="EN Notice Sent Date" sortKey="noticeSentDate" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange} />
                  <ColumnHeaderMenu label="Remaining Days Until Deadline" sortKey="remainingDays" currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange} />
                  <ColumnHeaderMenu label="Reminder Sent"   sortKey="reminderSent"     currentSortKey={sortKey} currentSortDir={sortDir} onSort={onSort} columnWidth={undefined} onColumnWidthChange={noopWidthChange}
                    filterOptions={['Yes', 'No']} selectedFilters={reminderSentColFilter}
                    onFilterChange={v => { setReminderSentColFilter(v); setPage(1); }} />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(row => {
                  const isUrgent = row.remainingDays != null && row.remainingDays <= 5 && row.reminderSent !== true;
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
                      <td>
                        <span className={`deadline-days-pill${isUrgent ? ' urgent' : ''}`} title={row.deadlineDate ? `Deadline: ${formatDate(row.deadlineDate)}` : undefined}>
                          {formatDays(row.remainingDays)}
                        </span>
                      </td>
                      <td>{yesNoText(row.reminderSent)}</td>
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
    </div>
  );
}

export { toReminderRow };
