import { useEffect, useMemo, useState, useRef, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import sharepointIconUrl from '/icons/sharepoint.svg?url';
import {
  Vsi_participantprogramyearsvsi_enrolmentstatus,
  type Vsi_participantprogramyears,
  type Vsi_participantprogramyearsBase,
  type Vsi_participantprogramyearsvsi_enrolmentstatus as EnrolmentStatusValue,
} from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { Vsi_armsconfigurationsService } from '../generated/services/Vsi_armsconfigurationsService';
import { Vsi_enrolmenthistoriesService } from '../generated/services/Vsi_enrolmenthistoriesService';
import { type Vsi_enrolmenthistories } from '../generated/models/Vsi_enrolmenthistoriesModel';
import { formatEnrolmentStatusDisplay, getAvatarColor, getInitials, getTaskStatusLabel, navGuard } from '../utils/helpers';
import { getCoreConfig, normalizeCoreBaseUrl } from '../hooks/useEnrolmentData';
import { useRole } from '../context/RoleContext';
import { Toast, type ToastMessage, nextToastId } from '../components/Toast';
import { normalizeEnrolmentId } from '../utils/deepLinks';

const CORE_APP_ID_FALLBACK = '88c024d9-9fd5-ec11-a7b5-002248ada475';
const CORE_BASE_URL_FALLBACK = 'https://aff-brmb-crm-dev.crm3.dynamics.com/main.aspx';

type DateField =
  | 'vsi_enrolmentnoticesentdate'
  | 'vsi_programyearoptoutdate'
  | 'vsi_lateenrolmentnoticesentdate'
  | 'vsi_enrolmentfeespaiddate'
  | 'vsi_enrolmentfeesnonpenaltyduedate'
  | 'vsi_enrolmentfeesfinaldeadlinedate'
  | 'vsi_lateenrolmentfeesfinaldeadlinedate';

type DetailFormState = {
  enrolmentStatus: EnrolmentStatusValue;
  vsi_fullyprovinciallyfunded: boolean;
  vsi_enrolmentnoticesentdate: string;
  vsi_programyearoptoutdate: string;
  vsi_lateenrolmentnoticesentdate: string;
  vsi_enrolmentfeespaiddate: string;
  vsi_enrolmentfeesnonpenaltyduedate: string;
  vsi_enrolmentfeesfinaldeadlinedate: string;
  vsi_lateenrolmentfeesfinaldeadlinedate: string;
};

const DATE_FIELDS: DateField[] = [
  'vsi_enrolmentnoticesentdate',
  'vsi_programyearoptoutdate',
  'vsi_lateenrolmentnoticesentdate',
  'vsi_enrolmentfeespaiddate',
  'vsi_enrolmentfeesnonpenaltyduedate',
  'vsi_enrolmentfeesfinaldeadlinedate',
  'vsi_lateenrolmentfeesfinaldeadlinedate',
];

const DETAIL_SELECT = [
  'vsi_name',
  '_vsi_participantid_value',
  '_vsi_programyearid_value',
  'vsi_sharepointdocumentfolder',
  'vsi_enrolmentstatus',
  'vsi_taskstatus',
  'owneridname',
  'vsi_totalfeesowedcalculated',
  'vsi_totalfeespaid',
  'vsi_enrolmentnoticesentdate',
  'vsi_programyearoptoutdate',
  'vsi_lateenrolmentnoticesentdate',
  'vsi_manualreview',
  'vsi_fullyprovinciallyfunded',
  'vsi_enrolmentfee',
  'vsi_enrolmentfeespaiddate',
  'vsi_enrolmentfeesnonpenaltyduedate',
  'vsi_enrolmentfeesfinaldeadlinedate',
  'vsi_lateenrolmentfeesfinaldeadlinedate',
  'vsi_administrativecostsharingfee',
  'vsi_latepaymentfee',
  'vsi_adjustedlateenrolmentfee',
  '_vsi_feemodifiedby_value',
  'vsi_fortyfivedayletterstartdate',
  'vsi_fortyfivedaycounterpaused',
  'vsi_fortyfivedaypausedate',
  'vsi_isnewparticipant',
  '_vsi_primaryenrolmenthistory_value',
] as const;

const formatCad = (value: number | undefined): string => {
  if (value == null || Number.isNaN(Number(value))) return '---';
  return `CA$${Number(value).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const yesNoText = (value: unknown): string => {
  if (value === true || value === 1 || value === '1') return 'Yes';
  if (value === false || value === 0 || value === '0') return 'No';
  return '---';
};

const toDateInputValue = (value: string | undefined): string => {
  if (!value) return '';
  const directMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) return directMatch[1];

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const initialFormFromRecord = (record: Vsi_participantprogramyears): DetailFormState => ({
  enrolmentStatus: record.vsi_enrolmentstatus,
  vsi_fullyprovinciallyfunded: Boolean(record.vsi_fullyprovinciallyfunded),
  vsi_enrolmentnoticesentdate: toDateInputValue(record.vsi_enrolmentnoticesentdate),
  vsi_programyearoptoutdate: toDateInputValue(record.vsi_programyearoptoutdate),
  vsi_lateenrolmentnoticesentdate: toDateInputValue(record.vsi_lateenrolmentnoticesentdate),
  vsi_enrolmentfeespaiddate: toDateInputValue(record.vsi_enrolmentfeespaiddate),
  vsi_enrolmentfeesnonpenaltyduedate: toDateInputValue(record.vsi_enrolmentfeesnonpenaltyduedate),
  vsi_enrolmentfeesfinaldeadlinedate: toDateInputValue(record.vsi_enrolmentfeesfinaldeadlinedate),
  vsi_lateenrolmentfeesfinaldeadlinedate: toDateInputValue(record.vsi_lateenrolmentfeesfinaldeadlinedate),
});

const getFormattedLookup = (record: Vsi_participantprogramyears, key: string): string => {
  const raw = record as unknown as Record<string, unknown>;
  const value = raw[key];
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return '';
};


export function EnrolmentDetailsPage() {
  // Read both source and enrolmentId from params
  const { source = 'dashboard', enrolmentId } = useParams<{ source?: string; enrolmentId: string }>();
  const navigate = useNavigate();
  const { activeRole } = useRole();
  const canEdit = activeRole === 'SystemAdmin' || activeRole === 'Supervisor';
  const resolvedEnrolmentId = normalizeEnrolmentId(enrolmentId);
  const routeSource = source === 'supervisor' ? 'supervisor' : 'dashboard';

  const [record, setRecord] = useState<Vsi_participantprogramyears | null>(null);
  const [formState, setFormState] = useState<DetailFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [coreAppId, setCoreAppId] = useState<string | null>(() => getCoreConfig().coreAppId);
  const [coreBaseUrl, setCoreBaseUrl] = useState<string | null>(() => getCoreConfig().coreBaseUrl);
  const [lateNoticeModal, setLateNoticeModal] = useState<
    | { type: 'error'; message: string }
    | { type: 'confirm' }
    | null
  >(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (message: string, type: ToastMessage['type']) => {
    setToasts(prev => [...prev, { id: nextToastId(), message, type }]);
  };
  const dismissToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const [syncingLateDeadline, setSyncingLateDeadline] = useState(false);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); }, []);

  const [showHistory, setShowHistory] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<Vsi_enrolmenthistories[]>([]);

  useEffect(() => {
    if (!resolvedEnrolmentId) return;
    Vsi_enrolmenthistoriesService.getAll({
      select: ['vsi_name', 'vsi_enrolmenthistoryid', 'vsi_enrolmentfee', '_vsi_feemodifiedby_value', 'createdon'],
      filter: `_vsi_participantprogramyearid_value eq '${resolvedEnrolmentId}'`,
      maxPageSize: 100,
    })
      .then(result => {
        const rows = result.data ?? [];
        rows.sort((a, b) => {
          const da = a.createdon ? new Date(a.createdon).getTime() : 0;
          const db = b.createdon ? new Date(b.createdon).getTime() : 0;
          return db - da;
        });
        setHistoryRecords(rows);
      })
      .catch(() => {});
  }, [resolvedEnrolmentId]);

  const handleShowHistory = () => setShowHistory(prev => !prev);

  useEffect(() => {
    if (coreAppId !== null) return;
    Vsi_armsconfigurationsService.getAll({ maxPageSize: 50, select: ['cr4dd_coreappid', 'vsi_coreenvironmenturl'] })
      .then(result => {
        const rows = result.data ?? [];
        setCoreAppId(rows.map(r => r.cr4dd_coreappid?.trim()).find((c): c is string => !!c) ?? null);
        setCoreBaseUrl(rows.map(r => normalizeCoreBaseUrl(r.vsi_coreenvironmenturl)).find((c): c is string => !!c) ?? null);
      })
      .catch(() => {});
  }, []);

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
          select: [...DETAIL_SELECT],
        });

        // Some environments are strict about select fields; retry without select to avoid hard-fail.
        if (!result?.data) {
          result = await Vsi_participantprogramyearsService.get(resolvedEnrolmentId);
        }
        if (cancelled) return;
        const loaded = result.data;
        if (!loaded) {
          setError('Unable to load enrolment details.');
          return;
        }
        setRecord(loaded);
        setFormState(initialFormFromRecord(loaded));
      } catch (e: unknown) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : 'Unable to load enrolment details.';
          setError(`Unable to load enrolment details. ${message}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedEnrolmentId]);

  const statusOptions = useMemo(
    () => Object.entries(Vsi_participantprogramyearsvsi_enrolmentstatus).map(([value, label]) => ({
      value: Number(value) as EnrolmentStatusValue,
      label: formatEnrolmentStatusDisplay(label),
    })),
    [],
  );

  const baseline = useMemo(() => (record ? initialFormFromRecord(record) : null), [record]);

  const hasChanges = useMemo(() => {
    if (!baseline || !formState) return false;
    return (
      baseline.enrolmentStatus !== formState.enrolmentStatus
      || baseline.vsi_fullyprovinciallyfunded !== formState.vsi_fullyprovinciallyfunded
      || DATE_FIELDS.some(field => baseline[field] !== formState[field])
    );
  }, [baseline, formState]);

  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
  const navigateWithGuard = (path: string) => {
    if (hasChanges) { setPendingNavPath(path); } else { navigate(path); }
  };

  // Register the nav guard so sidebar links can also be intercepted
  useEffect(() => {
    navGuard.register(setPendingNavPath);
    return () => navGuard.unregister();
  }, []);

  useEffect(() => {
    navGuard.setActive(hasChanges);
  }, [hasChanges]);

  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  const participantName = useMemo(() => {
    if (!record) return '---';
    const label = record.vsi_participantidname
      ?? getFormattedLookup(record, '_vsi_participantid_value@OData.Community.Display.V1.FormattedValue');
    return label || '---';
  }, [record]);

  const programYear = useMemo(() => {
    if (!record) return '---';
    const label = record.vsi_programyearidname
      ?? getFormattedLookup(record, '_vsi_programyearid_value@OData.Community.Display.V1.FormattedValue');
    return label || '---';
  }, [record]);

  const feeModifiedBy = useMemo(() => {
    if (!record) return '---';
    const label = record.vsi_feemodifiedbyname
      ?? getFormattedLookup(record, '_vsi_feemodifiedby_value@OData.Community.Display.V1.FormattedValue');
    return label || '---';
  }, [record]);

  const participantHref = useMemo(() => {
    if (!record) return null;
    const participantId = record._vsi_participantid_value;
    if (!participantId) return null;
    const appId = coreAppId?.trim() || CORE_APP_ID_FALLBACK;
    const baseUrl = coreBaseUrl?.trim() || CORE_BASE_URL_FALLBACK;
    return `${baseUrl}?appid=${encodeURIComponent(appId)}&pagetype=entityrecord&etn=account&id=${encodeURIComponent(participantId)}`;
  }, [record, coreAppId, coreBaseUrl]);

  const updateDateField = (field: DateField) => (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setSaveNotice(null);
    setFormState(prev => (prev ? { ...prev, [field]: value } : prev));
  };

  const onStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = Number(event.target.value) as EnrolmentStatusValue;
    setSaveNotice(null);
    setFormState(prev => (prev ? { ...prev, enrolmentStatus: nextValue } : prev));
  };

  const onLateParticipantChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSaveNotice(null);
    setFormState(prev => (prev ? { ...prev, vsi_fullyprovinciallyfunded: event.target.checked } : prev));
  };

  const startLateDeadlinePolling = (deadlineValueAfterSave: string, recordId: string) => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    setSyncingLateDeadline(true);
    let attempts = 0;
    const MAX_ATTEMPTS = 12; // 5s × 12 = 60 s

    syncIntervalRef.current = setInterval(async () => {
      attempts++;
      try {
        const polled = await Vsi_participantprogramyearsService.get(recordId, {
          select: ['vsi_lateenrolmentfeesfinaldeadlinedate'],
        });
        const newValue = toDateInputValue(polled?.data?.vsi_lateenrolmentfeesfinaldeadlinedate);
        if (newValue && newValue !== deadlineValueAfterSave) {
          clearInterval(syncIntervalRef.current!);
          syncIntervalRef.current = null;
          const full = await Vsi_participantprogramyearsService.get(recordId, { select: [...DETAIL_SELECT] });
          const updated = full?.data;
          if (updated) { setRecord(updated); setFormState(initialFormFromRecord(updated)); }
          setSyncingLateDeadline(false);
          addToast('Late enrolment fees deadline date has been updated by the system.', 'success');
          return;
        }
      } catch { /* ignore poll errors */ }
      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(syncIntervalRef.current!);
        syncIntervalRef.current = null;
        setSyncingLateDeadline(false);
      }
    }, 5000);
  };

  const handleSave = () => {
    if (!record || !formState || !baseline) return;

    const lateNoticeDateChanged =
      baseline.vsi_lateenrolmentnoticesentdate !== formState.vsi_lateenrolmentnoticesentdate &&
      !!formState.vsi_lateenrolmentnoticesentdate;

    if (lateNoticeDateChanged) {
      if (!formState.vsi_fullyprovinciallyfunded) {
        setLateNoticeModal({
          type: 'error',
          message: 'Late Participant must be set to Yes before saving the Late Enrolment Notice Sent Date.',
        });
        return;
      }
      if (!formState.vsi_lateenrolmentfeesfinaldeadlinedate) {
        setLateNoticeModal({
          type: 'error',
          message: 'Late enrolment fees final deadline date must be filled in before saving the Late Enrolment Notice Sent Date.',
        });
        return;
      }
      if (formState.vsi_lateenrolmentfeesfinaldeadlinedate <= formState.vsi_lateenrolmentnoticesentdate) {
        setLateNoticeModal({
          type: 'error',
          message: 'Late enrolment fees final deadline date must be after the Late Enrolment Notice Sent Date.',
        });
        return;
      }
      setLateNoticeModal({ type: 'confirm' });
      return;
    }

    void executeSave();
  };

  const executeSave = async (onSuccess?: (saved: Vsi_participantprogramyears) => void) => {
    if (!record || !formState) return;

    const changedFields: Partial<Omit<Vsi_participantprogramyearsBase, 'vsi_participantprogramyearid'>> = {};

    if (formState.enrolmentStatus !== record.vsi_enrolmentstatus) {
      changedFields.vsi_enrolmentstatus = formState.enrolmentStatus;

      // Clear 45-day fields when moving away from the 45 Day Letter status
      if (record.vsi_enrolmentstatus === 865520010 && formState.enrolmentStatus !== 865520010) {
        changedFields.vsi_fortyfivedayletterstartdate = null as unknown as string;
        changedFields.vsi_fortyfivedaylettersent = null as unknown as string;
        changedFields.vsi_fortyfivedaycounterpaused = null as unknown as boolean;
        changedFields.vsi_fortyfivedaypausedate = null as unknown as string;
      }

      // Set start date immediately when changing TO 45 Day Letter so the counter shows right away
      if (formState.enrolmentStatus === 865520010 && !record.vsi_fortyfivedayletterstartdate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        changedFields.vsi_fortyfivedayletterstartdate = today.toISOString();
      }
    }
    if (formState.vsi_fullyprovinciallyfunded !== Boolean(record.vsi_fullyprovinciallyfunded)) {
      changedFields.vsi_fullyprovinciallyfunded = formState.vsi_fullyprovinciallyfunded;
    }

    for (const field of DATE_FIELDS) {
      const existingValue = toDateInputValue(record[field]);
      const nextValue = formState[field];
      if (existingValue !== nextValue) {
        changedFields[field] = nextValue || null as unknown as string;
      }
    }

    if (Object.keys(changedFields).length === 0) {
      setSaveNotice('No changes to save.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSaveNotice(null);
      await Vsi_participantprogramyearsService.update(record.vsi_participantprogramyearid, changedFields);
      let refreshed = await Vsi_participantprogramyearsService.get(record.vsi_participantprogramyearid, {
        select: [...DETAIL_SELECT],
      });
      if (!refreshed?.data) {
        refreshed = await Vsi_participantprogramyearsService.get(record.vsi_participantprogramyearid);
      }
      const updated = refreshed.data ?? record;
      setRecord(updated);
      setFormState(initialFormFromRecord(updated));
      setSaveNotice('Changes saved.');
      onSuccess?.(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unable to save changes.');
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return <section className="details-wrapper"><p className="enrolment-loading">Loading details...</p></section>;
  }

  // Determine back link and label
  let backPath = '/dashboard-home';
  let backLabel = 'Back to Enrolments';
  if (routeSource === 'supervisor') {
    backPath = '/supervisor-approval';
    backLabel = 'Back to Supervisor Approval';
  }

  if (error || !record || !formState) {
    return (
      <section className="details-wrapper">
        <p className="enrolment-error">{error ?? 'Enrolment record not found.'}</p>
        <button type="button" className="details-back-btn" onClick={() => navigate(backPath)}>{backLabel}</button>
      </section>
    );
  }


  return (
    <section className="details-wrapper">
      <div className="details-title-row">
        <button type="button" className="details-back-btn" onClick={() => navigateWithGuard(backPath)}>{backLabel}</button>
        <h1 className="details-page-title">Enrolment App / Deadlines &amp; Fees</h1>
        <div className="details-meta-strip">
          <div className="details-info-card">
            <div className="details-info-stats-row">
              <div className="details-info-stat">
                <span className="details-info-value">{yesNoText(record.vsi_isnewparticipant)}</span>
                <span className="details-info-label">NPP</span>
              </div>
              <div className="details-info-stat-divider" />
              <div className="details-info-stat">
                {canEdit
                  ? (
                    <label className="details-info-value details-info-checkbox-label">
                      <input
                        type="checkbox"
                        checked={formState.vsi_fullyprovinciallyfunded}
                        onChange={onLateParticipantChange}
                        disabled={saving}
                      />
                      {formState.vsi_fullyprovinciallyfunded ? 'Yes' : 'No'}
                    </label>
                  )
                  : <span className="details-info-value">{yesNoText(formState.vsi_fullyprovinciallyfunded)}</span>
                }
                <span className="details-info-label">Late Participant</span>
              </div>
              <div className="details-info-stat-divider" />
              <div className="details-info-stat">
                <span className="details-info-value">{getTaskStatusLabel(record.vsi_taskstatus) || '—'}</span>
                <span className="details-info-label">Task Status</span>
              </div>
              <div className="details-info-stat-divider" />
              <div className="details-info-stat">
                {(() => {
                  const ownerName = record.owneridname || getFormattedLookup(record, '_ownerid_value@OData.Community.Display.V1.FormattedValue') || '';
                  return (
                    <span className="details-info-value details-info-owner-value">
                      <span
                        className="avatar-circle"
                        style={{ background: getAvatarColor(ownerName), flexShrink: 0 }}
                        aria-hidden="true"
                      >
                        {getInitials(ownerName)}
                      </span>
                      {ownerName || '—'}
                    </span>
                  );
                })()}
                <span className="details-info-label">Owner</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="details-composite">
        <div className="details-header-band">
          <div className="details-header-grid">
            <div className="details-field">
              {participantHref
                ? <a className="details-participant-name" href={participantHref} target="_blank" rel="noopener noreferrer">{participantName}</a>
                : <span className="details-participant-name">{participantName}</span>
              }
              <span className="details-label">Participant</span>
            </div>

            <div className="details-fortyfiveday-cell">
              {record.vsi_enrolmentstatus === 865520010 && (() => {
                const startDate = record.vsi_fortyfivedayletterstartdate as string | undefined;
                const paused = !!(record as unknown as Record<string, unknown>)['vsi_fortyfivedaycounterpaused'];
                const pauseDate = (record as unknown as Record<string, unknown>)['vsi_fortyfivedaypausedate'] as string | undefined;
                const referenceMs = paused && pauseDate ? new Date(pauseDate).getTime() : Date.now();
                const elapsedDays = startDate
                  ? Math.floor((referenceMs - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
                  : null;
                const remainingDays = elapsedDays !== null ? 45 - elapsedDays : null;
                return (
                  <div className="calc-fortyfiveday-card details-fortyfiveday-card" aria-label="45-day letter counter">
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
                  </div>
                );
              })()}
            </div>

            <div className="details-link-field">
              {record.vsi_sharepointdocumentfolder ? (
                <a
                  className="calc-outline-btn calc-sharepoint-btn"
                  href={record.vsi_sharepointdocumentfolder}
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
                  title="No SharePoint folder link found for this enrolment"
                >
                  <img src={sharepointIconUrl} className="calc-sharepoint-icon" alt="" aria-hidden="true" />
                  Go to SharePoint
                </button>
              )}
              <button
                type="button"
                className="calc-outline-btn"
                onClick={() => navigateWithGuard(`/calculation/${routeSource}/${resolvedEnrolmentId}`)}
              >
                <Calculator size={15} /> Go to Calculation
              </button>
            </div>
          </div>
        </div>

        <div className="details-content-section details-content-main">
          <div className="details-main-grid">
            <div className="details-field">
              <span className="details-label">Enrolment Status <span className="required-mark">*</span></span>
              <select
                id="enrolment-status"
                value={formState.enrolmentStatus}
                onChange={onStatusChange}
                className="details-select"
                disabled={saving || !canEdit}
              >
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="details-field">
              <span className="details-label">Total Fees Owed</span>
              <strong className="details-money">{formatCad(record.vsi_totalfeesowedcalculated)}</strong>
            </div>

            <div className="details-field">
              <span className="details-label">Program Year</span>
              <strong className="details-value-strong">{programYear}</strong>
            </div>

            <div className="details-field">
              <label htmlFor="enrol-notice-date" className="details-label">Enrolment Notice Sent Date</label>
              <input
                id="enrol-notice-date"
                type="date"
                className="details-date"
                value={formState.vsi_enrolmentnoticesentdate}
                onChange={updateDateField('vsi_enrolmentnoticesentdate')}
                disabled={saving || !canEdit}
              />
            </div>

            <div className="details-field">
              <span className="details-label">Total Fees Paid</span>
              <strong className="details-money">{formatCad(record.vsi_totalfeespaid)}</strong>
            </div>

            <div className="details-field">
              <label htmlFor="opt-out-date" className="details-label">Program Year Opt-Out Date</label>
              <input
                id="opt-out-date"
                type="date"
                className="details-date"
                value={formState.vsi_programyearoptoutdate}
                onChange={updateDateField('vsi_programyearoptoutdate')}
                disabled={saving || !canEdit}
              />
            </div>

            <div className="details-field">
              <label htmlFor="late-notice-date" className="details-label">Late Enrolment Notice Sent Date</label>
              <input
                id="late-notice-date"
                type="date"
                className="details-date"
                value={formState.vsi_lateenrolmentnoticesentdate}
                onChange={updateDateField('vsi_lateenrolmentnoticesentdate')}
                disabled={saving || !canEdit}
              />
            </div>
          </div>
        </div>

        <div className="details-section-break" />

        <div className="details-content-section details-content-fees">
          <div className="details-fees-grid">
            <div className="details-field">
              <span className="details-label">Enrolment Fee</span>
              <strong className="details-money">{formatCad(record.vsi_enrolmentfee)}</strong>
            </div>

            <div className="details-field">
              <label htmlFor="enrol-fees-paid-date" className="details-label">Enrolment Fees Paid Date</label>
              <input
                id="enrol-fees-paid-date"
                type="date"
                className="details-date"
                value={formState.vsi_enrolmentfeespaiddate}
                onChange={updateDateField('vsi_enrolmentfeespaiddate')}
                disabled={saving || !canEdit}
              />
            </div>

            <div className="details-field">
              <label htmlFor="non-penalty-date" className="details-label">Enrolment-fees non-penalty due date</label>
              <input
                id="non-penalty-date"
                type="date"
                className="details-date"
                value={formState.vsi_enrolmentfeesnonpenaltyduedate}
                onChange={updateDateField('vsi_enrolmentfeesnonpenaltyduedate')}
                disabled={saving || !canEdit}
              />
            </div>

            <div className="details-field">
              <label htmlFor="final-deadline-date" className="details-label">Enrolment fees final deadline date</label>
              <input
                id="final-deadline-date"
                type="date"
                className="details-date"
                value={formState.vsi_enrolmentfeesfinaldeadlinedate}
                onChange={updateDateField('vsi_enrolmentfeesfinaldeadlinedate')}
                disabled={saving || !canEdit}
              />
            </div>

            <div className="details-field">
              <span className="details-label">Administrative cost Sharing fee</span>
              <strong className="details-money details-money-alert">{formatCad(record.vsi_administrativecostsharingfee)}</strong>
            </div>

            <div className="details-field">
              <span className="details-label">Late payment fee</span>
              <strong className="details-money">{formatCad(record.vsi_latepaymentfee)}</strong>
            </div>

            <div className="details-field">
              <span className="details-label">Adjusted late enrolment fee</span>
              <strong className="details-money">{formatCad(record.vsi_adjustedlateenrolmentfee)}</strong>
            </div>

            <div className="details-field">
              <label htmlFor="late-enrol-fees-final-deadline-date" className="details-label">
                Late enrolment fees final deadline date
                {syncingLateDeadline && <span className="details-syncing-indicator"> ⟳ Syncing…</span>}
              </label>
              <input
                id="late-enrol-fees-final-deadline-date"
                type="date"
                className="details-date"
                value={formState.vsi_lateenrolmentfeesfinaldeadlinedate}
                onChange={updateDateField('vsi_lateenrolmentfeesfinaldeadlinedate')}
                disabled={saving || !canEdit || syncingLateDeadline}
              />
            </div>

            {(() => {
              const raw = record as unknown as Record<string, unknown>;
              const historyId = record._vsi_primaryenrolmenthistory_value
                ?? (raw['_vsi_primaryenrolmenthistory_value'] as string | undefined);
              const historyName = (raw['vsi_primaryenrolmenthistoryname'] as string | undefined)
                ?? (raw['_vsi_primaryenrolmenthistory_value@OData.Community.Display.V1.FormattedValue'] as string | undefined);
              return (
                <div className="details-field">
                  <span className="details-label">Primary Enrolment History</span>
                  <div className="history-primary-row">
                    {historyId
                      ? (
                        <button
                          type="button"
                          className="history-name-link"
                          onClick={() => navigateWithGuard(`/history/${resolvedEnrolmentId}/${historyId}`)}
                        >
                          {historyName || historyId}
                        </button>
                      )
                      : <span className="details-value-muted">---</span>
                    }
                    <button
                      type="button"
                      className="history-toggle-btn"
                      onClick={handleShowHistory}
                    >
                      {showHistory ? 'Hide histories' : 'Show all histories'}
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className="details-field">
              <span className="details-label">Fee modified by:</span>
              <strong className="details-value-strong">{feeModifiedBy}</strong>
            </div>
          </div>
        </div>

        {showHistory && (
          <>
            <div className="details-section-break" />
            <div className="details-content-section">
              <table className="history-table">
                <thead>
                  <tr>
                    <th className="history-th">Enrolment History Name</th>
                    <th className="history-th">Enrolment Fee</th>
                    <th className="history-th">Fee Modified By</th>
                    <th className="history-th">Created On</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRecords.map(h => {
                    const hRaw = h as unknown as Record<string, unknown>;
                    const modifiedBy =
                      (hRaw['vsi_feemodifiedbyname'] as string | undefined) ??
                      (hRaw['_vsi_feemodifiedby_value@OData.Community.Display.V1.FormattedValue'] as string | undefined) ??
                      '---';
                    return (
                      <tr key={h.vsi_enrolmenthistoryid} className="history-tr">
                        <td className="history-td">
                          <button
                            type="button"
                            className="history-name-link"
                            onClick={() => navigateWithGuard(`/history/${resolvedEnrolmentId}/${h.vsi_enrolmenthistoryid}`)}
                          >
                            {h.vsi_name}
                          </button>
                        </td>
                        <td className="history-td">
                          {h.vsi_enrolmentfee != null
                            ? `CA$${Number(h.vsi_enrolmentfee).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '---'}
                        </td>
                        <td className="history-td">{modifiedBy}</td>
                        <td className="history-td">
                          {h.createdon ? new Date(h.createdon).toLocaleDateString('en-CA') : '---'}
                        </td>
                      </tr>
                    );
                  })}
                  {historyRecords.length === 0 && (
                    <tr><td className="history-td" colSpan={4}>No history records found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="details-actions">
        {saveNotice ? <span className="details-save-notice">{saveNotice}</span> : null}
        <button type="button" className="details-save-btn" onClick={handleSave} disabled={saving || !hasChanges || !canEdit}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {lateNoticeModal && (
        <div className="modal-overlay" onClick={() => setLateNoticeModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{lateNoticeModal.type === 'error' ? 'Validation Error' : 'Generate Late Enrolment Notice'}</h3>
              <button className="modal-close" onClick={() => setLateNoticeModal(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="no-selection-message">
                {lateNoticeModal.type === 'error'
                  ? lateNoticeModal.message
                  : 'Saving this date will trigger generation of the Late Enrolment Notice, which will be placed in the participant\'s SharePoint folder. Do you want to continue?'}
              </div>
            </div>
            <div className="modal-footer">
              {lateNoticeModal.type === 'confirm' && (
                <button
                  className="btn-ok"
                  onClick={() => { setLateNoticeModal(null); void executeSave((saved) => { addToast('Save complete. File will be in SharePoint folder momentarily.', 'success'); startLateDeadlinePolling(toDateInputValue(saved.vsi_lateenrolmentfeesfinaldeadlinedate), saved.vsi_participantprogramyearid); }); }}
                >
                  Confirm
                </button>
              )}
              <button className="btn-cancel" onClick={() => setLateNoticeModal(null)}>
                {lateNoticeModal.type === 'error' ? 'OK' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />

      {pendingNavPath && (
        <div className="modal-overlay">
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Unsaved Changes</h3>
            </div>
            <div className="modal-body">
              <div className="no-selection-message">You have unsaved changes. Are you sure you want to leave without saving?</div>
            </div>
            <div className="modal-footer">
              <button className="btn-ok" onClick={() => { navigate(pendingNavPath); setPendingNavPath(null); }}>Leave without saving</button>
              <button className="btn-cancel" onClick={() => setPendingNavPath(null)}>Stay</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

