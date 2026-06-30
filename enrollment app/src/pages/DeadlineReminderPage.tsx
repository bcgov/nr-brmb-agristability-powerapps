import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { CORE_APP_ID_FALLBACK, CORE_BASE_URL_FALLBACK } from '../constants/config';
import { formatCurrencyOr, formatEnrolmentStatusDisplay, getEnrolmentStatusLabel } from '../utils/helpers';
import '../styles/supervisor-approval.css';

type DeadlineReminderKind = 'nonPenalty' | 'finalDeadline';

type DeadlineReminderRow = {
  item: Vsi_participantprogramyears;
  itemId: string;
  participantId?: string;
  participantName: string;
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

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const calculateRemainingDays = (deadline?: string): number | null => {
  if (!deadline) return null;
  const deadlineDate = new Date(deadline);
  if (Number.isNaN(deadlineDate.getTime())) return null;
  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(deadlineDate);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
};

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};

const formatDays = (value: number | null) => {
  if (value == null) return '-';
  if (value === 0) return 'Today';
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

const toReminderRow = (item: Vsi_participantprogramyears): DeadlineReminderRow | null => {
  const itemId = normalizeGuid(item.vsi_participantprogramyearid);
  if (!itemId) return null;

  const status = Number(item.vsi_enrolmentstatus);
  const isNoticeSent = status === EN_STATUS_ENROLMENT_NOTICE_SENT;
  const isEnrolledNotPaid = status === EN_STATUS_ENROLLED_NOT_PAID;
  if (!isNoticeSent && !isEnrolledNotPaid) return null;

  const deadlineDate = isNoticeSent
    ? item.vsi_enrolmentfeesnonpenaltyduedate
    : item.vsi_enrolmentfeesfinaldeadlinedate;

  const reminderSent = isNoticeSent
    ? item.vsi_nonpenaltydeadlineremindersent ?? null
    : item.vsi_finaldeadlineremindersent ?? null;

  return {
    item,
    itemId,
    participantId: item._vsi_participantid_value,
    participantName: getDisplayValue(item, '_vsi_participantid_value@OData.Community.Display.V1.FormattedValue', item.vsi_participantidname),
    year: getDisplayValue(item, '_vsi_programyearid_value@OData.Community.Display.V1.FormattedValue', item.vsi_programyearidname),
    enrolmentStatusLabel: getEnrolmentStatusLabel(item.vsi_enrolmentstatus) || '-',
    totalFeesOwed: item.vsi_totalfeesowed ?? item.vsi_totalfeesowedcalculated ?? null,
    noticeSentDate: item.vsi_enrolmentnoticesentdate,
    deadlineDate,
    remainingDays: calculateRemainingDays(deadlineDate),
    reminderSent,
    kind: isNoticeSent ? 'nonPenalty' : 'finalDeadline',
  };
};

export function DeadlineReminderPage() {
  const [items, setItems] = useState<Vsi_participantprogramyears[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await Vsi_participantprogramyearsService.getAll({
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
          ],
          filter: `vsi_enrolmentstatus eq ${EN_STATUS_ENROLMENT_NOTICE_SENT} or vsi_enrolmentstatus eq ${EN_STATUS_ENROLLED_NOT_PAID}`,
          orderBy: ['vsi_enrolmentfeesfinaldeadlinedate asc'],
          maxPageSize: 5000,
        });

        if (cancelled) return;
        if (!result.success) {
          setItems([]);
          setError(result.error?.message ?? 'Unable to load deadline reminders.');
          return;
        }

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
    return items
      .map(toReminderRow)
      .filter((row): row is DeadlineReminderRow => row !== null)
      .sort((a, b) => {
        const aDays = a.remainingDays ?? Number.POSITIVE_INFINITY;
        const bDays = b.remainingDays ?? Number.POSITIVE_INFINITY;
        if (aDays !== bDays) return aDays - bDays;
        return a.item.vsi_name.localeCompare(b.item.vsi_name);
      });
  }, [items]);

  const urgentRows = rows.filter(row => row.remainingDays != null && row.remainingDays <= 5 && row.reminderSent !== true);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
        <div className="deadline-reminder-summary-item">
          <span className="deadline-reminder-summary-label">Total</span>
          <strong>{rows.length}</strong>
        </div>
        <div className="deadline-reminder-summary-item urgent">
          <span className="deadline-reminder-summary-label">Due within 5 days</span>
          <strong>{urgentRows.length}</strong>
        </div>
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
                  <th>Enrolment Name</th>
                  <th>Year</th>
                  <th>Participant</th>
                  <th>Enrolment Status</th>
                  <th>Total Fees Owed</th>
                  <th>EN Notice Sent Date</th>
                  <th>Remaining Days Until Deadline</th>
                  <th>Reminder Sent</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(row => {
                  const isUrgent = row.remainingDays != null && row.remainingDays <= 5 && row.reminderSent !== true;
                  const participantHref = row.participantId
                    ? `${CORE_BASE_URL_FALLBACK}?appid=${encodeURIComponent(CORE_APP_ID_FALLBACK)}&pagetype=entityrecord&etn=account&id=${encodeURIComponent(row.participantId)}`
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
              {`Showing ${Math.min((page - 1) * PAGE_SIZE + 1, rows.length)}-${Math.min(page * PAGE_SIZE, rows.length)} of ${rows.length} result${rows.length !== 1 ? 's' : ''}`}
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

export { calculateRemainingDays, toReminderRow };
