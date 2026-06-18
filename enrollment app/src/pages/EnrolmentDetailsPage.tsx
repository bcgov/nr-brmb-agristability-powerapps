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
import { AccountsService } from '../generated/services/AccountsService';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { Vsi_armsconfigurationsService } from '../generated/services/Vsi_armsconfigurationsService';
import { Vsi_enrolmenthistoriesService } from '../generated/services/Vsi_enrolmenthistoriesService';
import { type Vsi_enrolmenthistories } from '../generated/models/Vsi_enrolmenthistoriesModel';
import { CORE_APP_ID_FALLBACK, CORE_BASE_URL_FALLBACK } from '../constants/config';
import { formatEnrolmentStatusDisplay, getAvatarColor, getInitials, getTaskStatusLabel, navGuard } from '../utils/helpers';
import { getCoreConfig, normalizeCoreBaseUrl } from '../hooks/useEnrolmentData';
import { useRole } from '../context/RoleContext';
import { Toast, type ToastMessage, nextToastId } from '../components/Toast';
import { EnrolmentPartnersPanel } from '../components/EnrolmentPartnersPanel';
import { normalizeEnrolmentId, openInNewTab } from '../utils/deepLinks';
import { toDateInputValue } from '../utils/date';
import { farmsApi } from '../services/farmsApi';
import {
  getCombinedFarmSummaryFromResponse,
  getNumericProgramYear,
  getParticipantPin,
  getPartnerDataverseDetails,
  getPartnerRowsFromResponse,
  resolvePartnerAccountId,
  resolvePartnerEnrolmentId,
  resolveProgramYearId,
  type CombinedFarmSummary,
  type EnrolmentPartnerListRsrc,
  type PartnerComparisonRow,
} from '../services/enrolmentPartners';

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

type EnrolmentUpdateFields = Partial<Omit<Vsi_participantprogramyearsBase, 'vsi_participantprogramyearid'>>;

type NullableUpdateKey =
  | DateField
  | 'vsi_fortyfivedayletterstartdate'
  | 'vsi_fortyfivedaylettersent'
  | 'vsi_fortyfivedaycounterpaused'
  | 'vsi_fortyfivedaypausedate';

type NullableEnrolmentUpdateFields = Omit<EnrolmentUpdateFields, NullableUpdateKey> & {
  [K in DateField]?: string | null;
} & {
  vsi_fortyfivedayletterstartdate?: string | null;
  vsi_fortyfivedaylettersent?: string | null;
  vsi_fortyfivedaycounterpaused?: boolean | null;
  vsi_fortyfivedaypausedate?: string | null;
};

const toServiceUpdatePayload = (
  fields: NullableEnrolmentUpdateFields,
): Parameters<typeof Vsi_participantprogramyearsService.update>[1] =>
  fields as Parameters<typeof Vsi_participantprogramyearsService.update>[1];

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
  'vsi_nonpenaltydeadlinedaysleft',
  'vsi_finaldeadlinedaysdiff',
  'vsi_latefinaldeadlinedaysdiff',
  'vsi_nonpenaltydeadlineremindersent',
  'vsi_finaldeadlineremindersent',
  'vsi_latefinaldeadlineremindersent',
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

const formatCad = (value: unknown): string => {
  if (value == null || Number.isNaN(Number(value))) return '---';
  return `CA$${Number(value).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const yesNoText = (value: unknown): string => {
  if (value === true || value === 1 || value === '1') return 'Yes';
  if (value === false || value === 0 || value === '0') return 'No';
  return '---';
};

const toBooleanFlag = (value: unknown): boolean | null => {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'yes' || normalized === 'true') return true;
    if (normalized === 'no' || normalized === 'false') return false;
  }
  return null;
};

const ACCOUNT_OPT_OUT_SELECT = [
  'vsi_quitagristabilityprogram',
  'vsi_quitagristabilityprogramname',
  'msdyn_gdproptout',
  'msdyn_gdproptoutname',
  'vsi_programyearoptoutdate',
] as const;

const hasDateValue = (value: string | null | undefined): boolean =>
  toDateInputValue(value ?? undefined).length > 0;

const resolveAccountOptOutFlag = (account: Record<string, unknown> | undefined): boolean | null => {
  if (!account) return null;
  const candidates: Array<unknown> = [
    account['vsi_quitagristabilityprogram'],
    account['vsi_quitagristabilityprogramname'],
    account['vsi_quitagristabilityprogram@OData.Community.Display.V1.FormattedValue'],
    account['msdyn_gdproptout'],
    account['msdyn_gdproptoutname'],
    account['msdyn_gdproptout@OData.Community.Display.V1.FormattedValue'],
    account['vsi_programyearoptout'],
    account['vsi_programyearoptoutname'],
    account['vsi_programyearoptout@OData.Community.Display.V1.FormattedValue'],
    account['vsi_optedout'],
    account['vsi_optedoutname'],
    account['vsi_optedout@OData.Community.Display.V1.FormattedValue'],
    account['vsi_optout'],
    account['vsi_optoutname'],
    account['vsi_optout@OData.Community.Display.V1.FormattedValue'],
  ];
  return candidates
    .map(candidate => toBooleanFlag(candidate))
    .find((candidate): candidate is boolean => candidate !== null) ?? null;
};

const formatDaysValue = (value: number | undefined): string => {
  if (value == null || Number.isNaN(Number(value))) return '---';
  const days = Math.trunc(Number(value));
  return `${days} day${Math.abs(days) === 1 ? '' : 's'}`;
};

const isUrgentDays = (value: number | undefined): boolean =>
  value != null && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 7;

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

function getEnrolmentStatusChanges(
  currentStatus: EnrolmentStatusValue | null,
  nextStatus: EnrolmentStatusValue,
  hasFortyFiveDayStartDate = false,
): NullableEnrolmentUpdateFields {
  const changedFields: NullableEnrolmentUpdateFields = {
    vsi_enrolmentstatus: nextStatus,
  };

  if (currentStatus === 865520010 && nextStatus !== 865520010) {
    changedFields.vsi_fortyfivedayletterstartdate = null;
    changedFields.vsi_fortyfivedaylettersent = null;
    changedFields.vsi_fortyfivedaycounterpaused = null;
    changedFields.vsi_fortyfivedaypausedate = null;
  }

  if (currentStatus !== 865520010 && nextStatus === 865520010 && !hasFortyFiveDayStartDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    changedFields.vsi_fortyfivedayletterstartdate = today.toISOString();
  }

  return changedFields;
}

const getFormattedLookup = (record: Vsi_participantprogramyears, key: string): string => {
  const raw = record as unknown as Record<string, unknown>;
  const value = raw[key];
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return '';
};

const toLooseRecord = (value: unknown): Record<string, unknown> | undefined =>
  (typeof value === 'object' && value !== null)
    ? (value as Record<string, unknown>)
    : undefined;

const getNormalizedParticipantId = (record: Vsi_participantprogramyears | null): string | null =>
  record?._vsi_participantid_value?.replace(/[{}]/g, '') ?? null;

const getRecordDateOptOutFallback = (record: Vsi_participantprogramyears | null): boolean =>
  hasDateValue(record?.vsi_programyearoptoutdate);

const getRecordLookupLabel = (
  record: Vsi_participantprogramyears,
  directValue: string | null | undefined,
  fallbackLookupKey: string,
): string => {
  const label = directValue ?? getFormattedLookup(record, fallbackLookupKey);
  return label || '---';
};

const buildCoreEntityRecordHref = (
  baseUrl: string,
  appId: string,
  entityName: string,
  recordId: string,
): string => `${baseUrl}?appid=${encodeURIComponent(appId)}&pagetype=entityrecord&etn=${encodeURIComponent(entityName)}&id=${encodeURIComponent(recordId)}`;


export function EnrolmentDetailsPage() {
  // Read both source and enrolmentId from params
  const { source = 'dashboard', enrolmentId } = useParams<{ source?: string; enrolmentId: string }>();
  const navigate = useNavigate();
  const { activeRole } = useRole();
  const canEdit = activeRole === 'SystemAdmin' || activeRole === 'Supervisor';
  const resolvedEnrolmentId = normalizeEnrolmentId(enrolmentId);
  const routeSource = source === 'supervisor' ? 'supervisor' : 'dashboard';

  const [record, setRecord] = useState<Vsi_participantprogramyears | null>(null);
  const [isParticipantOptedOut, setIsParticipantOptedOut] = useState(false);
  const [formState, setFormState] = useState<DetailFormState | null>(null);
  const [participantPin, setParticipantPin] = useState('');
  const [partnerRows, setPartnerRows] = useState<PartnerComparisonRow[]>([]);
  const [combinedFarmSummary, setCombinedFarmSummary] = useState<CombinedFarmSummary | null>(null);
  const [partnerRowsLoading, setPartnerRowsLoading] = useState(false);
  const [partnerRowsError, setPartnerRowsError] = useState<string | null>(null);
  const [openingPartnerKey, setOpeningPartnerKey] = useState<string | null>(null);
  const [partnerNavigationError, setPartnerNavigationError] = useState<string | null>(null);
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

  useEffect(() => {
    const participantId = getNormalizedParticipantId(record);
    if (!participantId) {
      setParticipantPin('');
      return;
    }

    let cancelled = false;
    setParticipantPin('');
    getParticipantPin(participantId)
      .then(pin => {
        if (!cancelled) setParticipantPin(pin);
      })
      .catch(() => {
        if (!cancelled) setParticipantPin('');
      });

    return () => {
      cancelled = true;
    };
  }, [record]);

  useEffect(() => {
    const participantId = getNormalizedParticipantId(record);
    const fallbackOptOut = getRecordDateOptOutFallback(record);
    if (!participantId) {
      setIsParticipantOptedOut(fallbackOptOut);
      return;
    }

    let cancelled = false;
    setIsParticipantOptedOut(false);

    (async () => {
      try {
        let account = toLooseRecord((await AccountsService.get(participantId, {
          select: [...ACCOUNT_OPT_OUT_SELECT],
        })).data);

        let resolvedFlag = resolveAccountOptOutFlag(account);

        if (resolvedFlag === null) {
          account = toLooseRecord((await AccountsService.get(participantId)).data);
          resolvedFlag = resolveAccountOptOutFlag(account);
        }

        if (cancelled) return;

        if (resolvedFlag !== null) {
          setIsParticipantOptedOut(resolvedFlag);
          return;
        }

        const optOutDate = account?.['vsi_programyearoptoutdate'];
        if (typeof optOutDate === 'string' && optOutDate.trim()) {
          setIsParticipantOptedOut(hasDateValue(optOutDate));
          return;
        }

        setIsParticipantOptedOut(fallbackOptOut);
      } catch {
        if (!cancelled) {
          setIsParticipantOptedOut(fallbackOptOut);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [record]);

  const enrolmentProgramYear = useMemo(() => getNumericProgramYear(record), [record]);
  const farmsScenarioProgramYear = enrolmentProgramYear ? enrolmentProgramYear - 2 : null;

  useEffect(() => {
    if (!participantPin || !farmsScenarioProgramYear) {
      setPartnerRows([]);
      setCombinedFarmSummary(null);
      setPartnerRowsError(null);
      setPartnerRowsLoading(false);
      return;
    }

    let cancelled = false;
    setPartnerRows([]);
    setCombinedFarmSummary(null);
    setPartnerRowsError(null);
    setPartnerRowsLoading(true);

    farmsApi.getEnrolmentPartners<EnrolmentPartnerListRsrc>(
      participantPin,
      farmsScenarioProgramYear,
    )
      .then(async result => {
        if (cancelled) return;
        if (!result.success) {
          throw new Error(result.error?.message ?? 'Unable to load FARMS enrolment partners.');
        }

        const rows = getPartnerRowsFromResponse(result.data);
        const programYearId = enrolmentProgramYear
          ? await resolveProgramYearId(enrolmentProgramYear)
          : null;
        const enrichedRows = programYearId
          ? await Promise.all(rows.map(async row => {
            try {
              const dataverseDetails = await getPartnerDataverseDetails(
                row.partnerParticipantPin,
                programYearId,
              );
              return { ...row, ...dataverseDetails };
            } catch {
              return row;
            }
          }))
          : rows;

        if (cancelled) return;
        setPartnerRows(enrichedRows);
        setCombinedFarmSummary(getCombinedFarmSummaryFromResponse(result.data));
      })
      .catch(err => {
        if (cancelled) return;
        setPartnerRows([]);
        setCombinedFarmSummary(null);
        setPartnerRowsError(err instanceof Error ? err.message : 'Unable to load FARMS enrolment partners.');
      })
      .finally(() => {
        if (!cancelled) setPartnerRowsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [participantPin, farmsScenarioProgramYear, enrolmentProgramYear]);

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

  const hasPartnerChanges = useMemo(
    () => partnerRows.some(row => (
      !!row.partnerEnrolmentId
      && (
        row.enrolmentStatus !== row.originalEnrolmentStatus
        || row.enrolmentFeesPaidDate !== row.originalEnrolmentFeesPaidDate
      )
    )),
    [partnerRows],
  );

  const hasChanges = useMemo(() => {
    if (!baseline || !formState) return false;
    return (
      baseline.enrolmentStatus !== formState.enrolmentStatus
      || baseline.vsi_fullyprovinciallyfunded !== formState.vsi_fullyprovinciallyfunded
      || DATE_FIELDS.some(field => baseline[field] !== formState[field])
      || hasPartnerChanges
    );
  }, [baseline, formState, hasPartnerChanges]);

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
    return getRecordLookupLabel(
      record,
      record.vsi_participantidname,
      '_vsi_participantid_value@OData.Community.Display.V1.FormattedValue',
    );
  }, [record]);

  const programYear = useMemo(() => {
    if (!record) return '---';
    return getRecordLookupLabel(
      record,
      record.vsi_programyearidname,
      '_vsi_programyearid_value@OData.Community.Display.V1.FormattedValue',
    );
  }, [record]);

  const feeModifiedBy = useMemo(() => {
    if (!record) return '---';
    return getRecordLookupLabel(
      record,
      record.vsi_feemodifiedbyname,
      '_vsi_feemodifiedby_value@OData.Community.Display.V1.FormattedValue',
    );
  }, [record]);

  const participantHref = useMemo(() => {
    if (!record) return null;
    const participantId = record._vsi_participantid_value;
    if (!participantId) return null;
    const appId = coreAppId?.trim() || CORE_APP_ID_FALLBACK;
    const baseUrl = coreBaseUrl?.trim() || CORE_BASE_URL_FALLBACK;
    return buildCoreEntityRecordHref(baseUrl, appId, 'account', participantId);
  }, [record, coreAppId, coreBaseUrl]);

  const openPartnerAccount = async (row: PartnerComparisonRow) => {
    const partnerPin = row.partnerParticipantPin.trim();
    if (!partnerPin) {
      setPartnerNavigationError('Partner PIN is missing.');
      return;
    }

    setOpeningPartnerKey(`account:${partnerPin}`);
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
      setOpeningPartnerKey(null);
    }
  };

  const openPartnerEnrolment = async (row: PartnerComparisonRow, target: 'details' | 'calculation') => {
    const partnerPin = row.partnerParticipantPin.trim();
    if (!partnerPin || !enrolmentProgramYear) {
      setPartnerNavigationError('Partner PIN or enrolment year is missing.');
      return;
    }

    setOpeningPartnerKey(`${target}:${partnerPin}`);
    setPartnerNavigationError(null);
    try {
      const partnerEnrolmentId = row.partnerEnrolmentId
        || await resolvePartnerEnrolmentId(partnerPin, enrolmentProgramYear);
      if (!partnerEnrolmentId) {
        setPartnerNavigationError(`No ${enrolmentProgramYear} enrolment found for partner PIN ${partnerPin}.`);
        return;
      }
      openInNewTab(`#/${target === 'details' ? 'enrolment' : 'calculation'}/${routeSource}/${partnerEnrolmentId}`);
    } catch (err) {
      setPartnerNavigationError(err instanceof Error ? err.message : 'Unable to open partner enrolment.');
    } finally {
      setOpeningPartnerKey(null);
    }
  };

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

  const onPartnerStatusChange = (partnerEnrolmentId: string, nextValue: EnrolmentStatusValue) => {
    setSaveNotice(null);
    setPartnerRows(rows => rows.map(row => (
      row.partnerEnrolmentId === partnerEnrolmentId
        ? { ...row, enrolmentStatus: nextValue }
        : row
    )));
  };

  const onPartnerPaidDateChange = (partnerEnrolmentId: string, value: string) => {
    setSaveNotice(null);
    setPartnerRows(rows => rows.map(row => (
      row.partnerEnrolmentId === partnerEnrolmentId
        ? { ...row, enrolmentFeesPaidDate: value }
        : row
    )));
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

    const changedFields: NullableEnrolmentUpdateFields = {};
    const changedPartnerRows = partnerRows.filter(row => (
      !!row.partnerEnrolmentId
      && (
        row.enrolmentStatus !== row.originalEnrolmentStatus
        || row.enrolmentFeesPaidDate !== row.originalEnrolmentFeesPaidDate
      )
    ));

    if (formState.enrolmentStatus !== record.vsi_enrolmentstatus) {
      Object.assign(
        changedFields,
        getEnrolmentStatusChanges(
          record.vsi_enrolmentstatus,
          formState.enrolmentStatus,
          !!record.vsi_fortyfivedayletterstartdate,
        ),
      );
    }
    if (formState.vsi_fullyprovinciallyfunded !== Boolean(record.vsi_fullyprovinciallyfunded)) {
      changedFields.vsi_fullyprovinciallyfunded = formState.vsi_fullyprovinciallyfunded;
    }

    for (const field of DATE_FIELDS) {
      const existingValue = toDateInputValue(record[field]);
      const nextValue = formState[field];
      if (existingValue !== nextValue) {
        changedFields[field] = nextValue || null;
      }
    }

    if (Object.keys(changedFields).length === 0 && changedPartnerRows.length === 0) {
      setSaveNotice('No changes to save.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSaveNotice(null);
      if (Object.keys(changedFields).length > 0) {
        const mainUpdate = await Vsi_participantprogramyearsService.update(
          record.vsi_participantprogramyearid,
          toServiceUpdatePayload(changedFields),
        );
        if (!mainUpdate.success) {
          throw new Error(mainUpdate.error?.message ?? 'Unable to save enrolment changes.');
        }
      }

      await Promise.all(changedPartnerRows.map(async row => {
        const partnerChanges: NullableEnrolmentUpdateFields = {};
        if (row.enrolmentStatus !== row.originalEnrolmentStatus && row.enrolmentStatus != null) {
          Object.assign(
            partnerChanges,
            getEnrolmentStatusChanges(
              row.originalEnrolmentStatus,
              row.enrolmentStatus,
            ),
          );
        }
        if (row.enrolmentFeesPaidDate !== row.originalEnrolmentFeesPaidDate) {
          partnerChanges.vsi_enrolmentfeespaiddate = row.enrolmentFeesPaidDate || null;
        }

        const partnerUpdate = await Vsi_participantprogramyearsService.update(
          row.partnerEnrolmentId,
          toServiceUpdatePayload(partnerChanges),
        );
        if (!partnerUpdate.success) {
          throw new Error(
            partnerUpdate.error?.message
              ?? `Unable to save partner PIN ${row.partnerParticipantPin}.`,
          );
        }
      }));

      let refreshed = await Vsi_participantprogramyearsService.get(record.vsi_participantprogramyearid, {
        select: [...DETAIL_SELECT],
      });
      if (!refreshed?.data) {
        refreshed = await Vsi_participantprogramyearsService.get(record.vsi_participantprogramyearid);
      }
      const updated = refreshed.data ?? record;
      setRecord(updated);
      setFormState(initialFormFromRecord(updated));
      setPartnerRows(rows => rows.map(row => (
        row.partnerEnrolmentId
          ? {
            ...row,
            originalEnrolmentStatus: row.enrolmentStatus,
            originalEnrolmentFeesPaidDate: row.enrolmentFeesPaidDate,
          }
          : row
      )));
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

  const nonPenaltyDaysLeft = record.vsi_nonpenaltydeadlinedaysleft;
  const finalDeadlineDaysLeft = record.vsi_finaldeadlinedaysdiff;
  const lateFinalDeadlineDaysLeft = record.vsi_latefinaldeadlinedaysdiff;


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
              <span className="details-label">Total Fees Paid</span>
              <strong className="details-money">{formatCad(record.vsi_totalfeespaid)}</strong>
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
              <div className="details-optout-row">
                <div className="details-optout-item details-optout-item-flag">
                  <span className="details-label">Opt-Out</span>
                  <span className="details-optout-flag"><strong>{isParticipantOptedOut ? 'Yes' : 'No'}</strong></span>
                </div>
                <div className="details-optout-item details-optout-item-date">
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
              </div>
            </div>
          </div>
        </div>

        <div className="details-section-break" />

        <div className="details-content-section details-content-fees">
          <div className="details-fees-summary-grid">
            <div className="details-field">
              <span className="details-label">Enrolment Fee</span>
              <strong className="details-money">{formatCad(record.vsi_enrolmentfee)}</strong>
            </div>

            <div className="details-field">
              <span className="details-label">Adjusted late enrolment fee</span>
              <strong className="details-money">{formatCad(record.vsi_adjustedlateenrolmentfee)}</strong>
            </div>

            <div className="details-field">
              <span className="details-label">Fee modified by:</span>
              <strong className="details-value-strong">{feeModifiedBy}</strong>
            </div>

            <div className="details-field">
              <span className="details-label">Administrative cost Sharing fee</span>
              <strong className="details-money details-money-alert">{formatCad(record.vsi_administrativecostsharingfee)}</strong>
            </div>

            <div className="details-field">
              <span className="details-label">Late payment fee</span>
              <strong className="details-money">{formatCad(record.vsi_latepaymentfee)}</strong>
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

          </div>
        </div>

        <div className="details-section-break" />

        <div className="details-content-section details-content-deadlines">
          <div className="details-deadlines-grid">
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
              <span className="details-label">Remaining days - non penalty deadline</span>
              <strong className={`details-value-strong details-days-left${isUrgentDays(nonPenaltyDaysLeft) ? ' details-days-left-urgent' : ''}`}>
                {formatDaysValue(nonPenaltyDaysLeft)}
              </strong>
            </div>

            <div className="details-field">
              <span className="details-label">Reminder Sent</span>
              <strong className="details-value-strong">{yesNoText(record.vsi_nonpenaltydeadlineremindersent)}</strong>
            </div>

            <div className="details-field details-field-spacer" aria-hidden="true" />

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
              <span className="details-label">Remaining days - penalty deadline</span>
              <strong className={`details-value-strong details-days-left${isUrgentDays(finalDeadlineDaysLeft) ? ' details-days-left-urgent' : ''}`}>
                {formatDaysValue(finalDeadlineDaysLeft)}
              </strong>
            </div>

            <div className="details-field">
              <span className="details-label">Reminder Sent</span>
              <strong className="details-value-strong">{yesNoText(record.vsi_finaldeadlineremindersent)}</strong>
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

            <div className="details-field">
              <span className="details-label">Remaining days - Late Enrolment deadlines</span>
              <strong className={`details-value-strong details-days-left${isUrgentDays(lateFinalDeadlineDaysLeft) ? ' details-days-left-urgent' : ''}`}>
                {formatDaysValue(lateFinalDeadlineDaysLeft)}
              </strong>
            </div>

            <div className="details-field">
              <span className="details-label">Reminder Sent</span>
              <strong className="details-value-strong">{yesNoText(record.vsi_latefinaldeadlineremindersent)}</strong>
            </div>
          </div>
        </div>

        <div className="details-section-break" />

        <EnrolmentPartnersPanel
          rows={partnerRows}
          combinedFarm={combinedFarmSummary}
          loading={partnerRowsLoading}
          error={partnerRowsError}
          navigationError={partnerNavigationError}
          openingPartnerKey={openingPartnerKey}
          enrolmentProgramYear={enrolmentProgramYear}
          statusOptions={statusOptions}
          saving={saving}
          canEdit={canEdit}
          formatCurrency={formatCad}
          onOpenAccount={row => { void openPartnerAccount(row); }}
          onOpenEnrolment={(row, target) => { void openPartnerEnrolment(row, target); }}
          onStatusChange={onPartnerStatusChange}
          onPaidDateChange={onPartnerPaidDateChange}
        />

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

