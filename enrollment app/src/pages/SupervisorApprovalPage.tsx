import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_participantprogramyearsvsi_enrolmentstatus } from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { QueueitemsService } from '../generated/services/QueueitemsService';
import { Office365UsersService } from '../generated/services/Office365UsersService';
import { SystemusersService } from '../generated/services/SystemusersService';
import { ColumnHeaderMenu } from '../components/ColumnHeaderMenu';
import { calculateVariance, enrolmentStatusClass, formatCurrencyOr, formatVariancePercent, getEnrolmentStatusLabel, getInitials, getTaskStatusLabel, getVarianceClass } from '../utils/helpers';
import { AssignWorkerModal } from '../components/AssignWorkerModal';
import type { FilterOperator, SortDir } from '../types/enrollment';
import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';
import '../styles/supervisor-approval.css';

const PAGE_SIZE = 20;
const ENROLMENT_STATUS_FILTER_OPTIONS = Object.values(Vsi_participantprogramyearsvsi_enrolmentstatus)
  .filter((label): label is (typeof Vsi_participantprogramyearsvsi_enrolmentstatus)[keyof typeof Vsi_participantprogramyearsvsi_enrolmentstatus] => typeof label === 'string' && label.length > 0)
  .sort((a, b) => a.localeCompare(b));

type QueueWorkMeta = {
  workedBy: string;
  workedOn: string;
  workedOnRaw?: string;
  enteredQueue?: string;
  enteredQueueRaw?: string;
  workerId?: string;
  queueitemId?: string;
  queueId?: string;
  queueName?: string;
  isActive?: boolean;
};

type SupervisorColumnKey = 'enrolmentName' | 'participant' | 'taskStatus' | 'enrolmentStatus' | 'calculatedFee' | 'enteredQueue' | 'workedBy' | 'workedOn';

type SupervisorColumnDef = {
  key: SupervisorColumnKey;
  label: string;
};

const SUPERVISOR_COLUMNS: SupervisorColumnDef[] = [
  { key: 'enrolmentName', label: 'Enrolment Name' },
  { key: 'participant', label: 'Participant' },
  { key: 'taskStatus', label: 'Task Status' },
  { key: 'enrolmentStatus', label: 'Enrolment Status' },
  { key: 'calculatedFee', label: 'Calculated Fee' },
  { key: 'enteredQueue', label: 'Entered Queue' },
  { key: 'workedBy', label: 'Worked By' },
  { key: 'workedOn', label: 'Worked On' },
];

const DEFAULT_COLUMN_ORDER: SupervisorColumnKey[] = SUPERVISOR_COLUMNS.map(c => c.key);
const DEFAULT_FILTER_OPS: Record<SupervisorColumnKey, FilterOperator> = {
  enrolmentName: 'equals',
  participant: 'equals',
  taskStatus: 'equals',
  enrolmentStatus: 'equals',
  calculatedFee: 'equals',
  enteredQueue: 'equals',
  workedBy: 'equals',
  workedOn: 'equals',
};

const createEmptyFilters = (): Record<SupervisorColumnKey, Set<string>> => ({
  enrolmentName: new Set(),
  participant: new Set(),
  taskStatus: new Set(),
  enrolmentStatus: new Set(),
  calculatedFee: new Set(),
  enteredQueue: new Set(),
  workedBy: new Set(),
  workedOn: new Set(),
});

type AssignTarget = {
  enrolmentId: string;
  enrolmentName: string;
  queueitemId: string | undefined;
  queueId?: string;
  queueName?: string;
};

function VariancePill({ variance }: { variance: number }) {
  const cls = getVarianceClass(variance);
  const text = formatVariancePercent(variance);
  return <span className={`variance-pill ${cls}`}>{text}</span>;
}

function StatusBadge({ status }: { status?: number }) {
  const label = getTaskStatusLabel(status) || 'Unknown';
  const clsByLabel: Record<string, string> = {
    Manual: 'pending',
    Supervisor: 'review',
    Ready: 'inprogress',
    Approved: 'approved',
  };
  const cls = clsByLabel[label] ?? 'pending';

  return (
    <span className={`sa-status-badge ${cls}`}>
      {label}
    </span>
  );
}

function getRowId(item: Vsi_participantprogramyears): string | null {
  return item.vsi_participantprogramyearid ?? null;
}

function formatWorkedOn(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

type XrmUserSettings = { userId?: string; userName?: string; userPrincipalName?: string };
type WinWithXrm = { Xrm?: { Utility?: { getGlobalContext?: () => { userSettings?: XrmUserSettings } } } };

function isEmail(value?: string): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value.trim());
}

function isGuid(value?: string): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function emailFromClaims(claims?: Record<string, unknown> | null): string | undefined {
  if (!claims) return undefined;
  const candidates = [
    claims.preferred_username,
    claims.upn,
    claims.email,
    claims.unique_name,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && isEmail(c)) return c.trim();
  }
  return undefined;
}

function aadObjectIdFromClaims(claims?: Record<string, unknown> | null): string | undefined {
  if (!claims) return undefined;
  const candidates = [
    claims.oid,
    claims.objectid,
    claims['http://schemas.microsoft.com/identity/claims/objectidentifier'],
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && isGuid(c)) return c.trim();
  }
  return undefined;
}

function findEmailInStorage(storage: Storage): string | undefined {
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;

    const direct = emailFromClaims(decodeJwtPayload(raw));
    if (direct) return direct;

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const claimBased = emailFromClaims(parsed);
      if (claimBased) return claimBased;

      const tokenCandidates = [
        parsed.secret,
        parsed.idToken,
        parsed.id_token,
        parsed.accessToken,
        parsed.access_token,
      ];
      for (const tokenValue of tokenCandidates) {
        if (typeof tokenValue !== 'string') continue;
        const tokenEmail = emailFromClaims(decodeJwtPayload(tokenValue));
        if (tokenEmail) return tokenEmail;
      }
    } catch {
      // ignore non-JSON values
    }
  }
  return undefined;
}

function findAadObjectIdInStorage(storage: Storage): string | undefined {
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;

    const direct = aadObjectIdFromClaims(decodeJwtPayload(raw));
    if (direct) return direct;

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const claimBased = aadObjectIdFromClaims(parsed);
      if (claimBased) return claimBased;

      const tokenCandidates = [
        parsed.secret,
        parsed.idToken,
        parsed.id_token,
        parsed.accessToken,
        parsed.access_token,
      ];
      for (const tokenValue of tokenCandidates) {
        if (typeof tokenValue !== 'string') continue;
        const tokenOid = aadObjectIdFromClaims(decodeJwtPayload(tokenValue));
        if (tokenOid) return tokenOid;
      }
    } catch {
      // ignore non-JSON values
    }
  }
  return undefined;
}

function getXrmUserSettings(): XrmUserSettings | undefined {
  try {
    const candidates = [window, window.parent, window.top];
    for (const w of candidates) {
      if (!w) continue;
      const settings = (w as unknown as WinWithXrm).Xrm?.Utility?.getGlobalContext?.()?.userSettings;
      if (settings?.userId || settings?.userName || settings?.userPrincipalName) return settings;
    }
  } catch {
    // cross-origin frame access may throw
  }
  return undefined;
}

function getXrmWebApiOnlineExecute(): ((request: unknown) => Promise<{ ok: boolean; json: () => Promise<Record<string, unknown>> }>) | undefined {
  try {
    const candidates = [window, window.parent, window.top];
    for (const w of candidates) {
      if (!w) continue;
      const execute = (w as unknown as {
        Xrm?: {
          WebApi?: {
            online?: {
              execute?: (request: unknown) => Promise<{ ok: boolean; json: () => Promise<Record<string, unknown>> }>;
            };
          };
        };
      }).Xrm?.WebApi?.online?.execute;
      if (execute) return execute;
    }
  } catch {
    // ignore cross-frame access issues
  }
  return undefined;
}

function getEmailFromUrlContext(): string | undefined {
  try {
    const url = new URL(window.location.href);
    const queryCandidates = ['login_hint', 'upn', 'email', 'userPrincipalName', 'username'];
    for (const key of queryCandidates) {
      const value = url.searchParams.get(key);
      if (value && isEmail(value)) return value.trim();
    }

    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    for (const key of queryCandidates) {
      const value = hash.get(key);
      if (value && isEmail(value)) return value.trim();
    }
  } catch {
    // ignore malformed URL parsing
  }
  return undefined;
}

function findEmailInUnknown(value: unknown, depth: number, seen: WeakSet<object>): string | undefined {
  if (depth <= 0 || value == null) return undefined;
  if (typeof value === 'string') {
    return isEmail(value) ? value.trim() : undefined;
  }
  if (typeof value !== 'object') return undefined;

  const obj = value as Record<string, unknown>;
  if (seen.has(obj)) return undefined;
  seen.add(obj);

  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (
      key.includes('email') ||
      key.includes('upn') ||
      key.includes('username') ||
      key.includes('login') ||
      key.includes('userprincipalname')
    ) {
      const byKey = findEmailInUnknown(v, depth - 1, seen);
      if (byKey) return byKey;
    }
  }

  for (const v of Object.values(obj)) {
    const nested = findEmailInUnknown(v, depth - 1, seen);
    if (nested) return nested;
  }

  return undefined;
}

function getEmailFromGlobalContextProbe(): string | undefined {
  try {
    const roots: unknown[] = [
      window,
      (window as unknown as Record<string, unknown>).PowerApps,
      (window as unknown as Record<string, unknown>).__POWERAPPS__,
      (window as unknown as Record<string, unknown>).__INITIAL_STATE__,
      (window as unknown as Record<string, unknown>).App,
      (window as unknown as Record<string, unknown>).app,
      (window as unknown as Record<string, unknown>).context,
      (window as unknown as Record<string, unknown>).bootstrap,
    ];

    const seen = new WeakSet<object>();
    for (const root of roots) {
      const email = findEmailInUnknown(root, 3, seen);
      if (email) return email;
    }
  } catch {
    // ignore probing issues
  }
  return undefined;
}

function getAuthenticatedUserEmail(): string | undefined {
  const xrmSettings = getXrmUserSettings();
  const upn = xrmSettings?.userPrincipalName;
  if (upn && isEmail(upn)) return upn.trim();
  const userName = xrmSettings?.userName;
  if (userName && isEmail(userName)) return userName.trim();

  try {
    const localEmail = findEmailInStorage(window.localStorage);
    if (localEmail) return localEmail;
  } catch {
    // ignore storage access issues
  }
  try {
    const sessionEmail = findEmailInStorage(window.sessionStorage);
    if (sessionEmail) return sessionEmail;
  } catch {
    // ignore storage access issues
  }
  return undefined;
}

function getAuthenticatedAadObjectId(): string | undefined {
  const xrmSettings = getXrmUserSettings() as XrmUserSettings & { aadObjectId?: string; aadobjectid?: string } | undefined;
  const fromXrm = xrmSettings?.aadObjectId ?? xrmSettings?.aadobjectid;
  if (fromXrm && isGuid(fromXrm)) return fromXrm.trim();

  try {
    const localOid = findAadObjectIdInStorage(window.localStorage);
    if (localOid) return localOid;
  } catch {
    // ignore storage access issues
  }
  try {
    const sessionOid = findAadObjectIdInStorage(window.sessionStorage);
    if (sessionOid) return sessionOid;
  } catch {
    // ignore storage access issues
  }
  return undefined;
}

async function resolveAuthenticatedEmail(): Promise<string | undefined> {
  const directEmail = getAuthenticatedUserEmail();
  if (directEmail) return directEmail;

  const urlEmail = getEmailFromUrlContext();
  if (urlEmail) return urlEmail;

  const globalProbeEmail = getEmailFromGlobalContextProbe();
  if (globalProbeEmail) return globalProbeEmail;

  const aadObjectId = getAuthenticatedAadObjectId();
  if (aadObjectId) {
    const byAadObjectId = await SystemusersService.getAll({
      select: ['internalemailaddress'],
      filter: `azureactivedirectoryobjectid eq '${aadObjectId}' and isdisabled eq false`,
      maxPageSize: 1,
    });
    if (byAadObjectId.success && byAadObjectId.data?.[0]?.internalemailaddress && isEmail(byAadObjectId.data[0].internalemailaddress)) {
      return byAadObjectId.data[0].internalemailaddress.trim();
    }
  }

  const xrmSettings = getXrmUserSettings();
  const xrmUserName = xrmSettings?.userName?.trim();
  if (xrmUserName && !isEmail(xrmUserName)) {
    const escapedUserName = xrmUserName.replace(/'/g, "''");

    const byFullName = await SystemusersService.getAll({
      select: ['internalemailaddress', 'fullname'],
      filter: `fullname eq '${escapedUserName}' and isdisabled eq false`,
      maxPageSize: 1,
    });
    if (byFullName.success && byFullName.data?.[0]?.internalemailaddress && isEmail(byFullName.data[0].internalemailaddress)) {
      return byFullName.data[0].internalemailaddress.trim();
    }

    const byDomain = await SystemusersService.getAll({
      select: ['internalemailaddress'],
      filter: `domainname eq '${escapedUserName}' and isdisabled eq false`,
      maxPageSize: 1,
    });
    if (byDomain.success && byDomain.data?.[0]?.internalemailaddress && isEmail(byDomain.data[0].internalemailaddress)) {
      return byDomain.data[0].internalemailaddress.trim();
    }
  }

  const userId = xrmSettings?.userId?.replace(/[{}]/g, '').trim();
  if (userId) {
    const byId = await SystemusersService.get(userId, {
      select: ['internalemailaddress'],
    });
    if (byId.success && byId.data?.internalemailaddress && isEmail(byId.data.internalemailaddress)) {
      return byId.data.internalemailaddress.trim();
    }
  }

  // Xrm WebApi fallback for embedded contexts where userSettings is unavailable.
  try {
    const execute = getXrmWebApiOnlineExecute();
    if (execute) {
      const whoAmIRequest = {
        getMetadata: () => ({
          boundParameter: null,
          parameterTypes: {},
          operationType: 1,
          operationName: 'WhoAmI',
        }),
      };
      const response = await execute(whoAmIRequest);
      if (response.ok) {
        const who = await response.json();
        const whoAmIUserId = (typeof who.UserId === 'string' ? who.UserId : undefined)?.replace(/[{}]/g, '').trim();
        if (whoAmIUserId) {
          const byWhoAmI = await SystemusersService.get(whoAmIUserId, {
            select: ['internalemailaddress'],
          });
          if (byWhoAmI.success && byWhoAmI.data?.internalemailaddress && isEmail(byWhoAmI.data.internalemailaddress)) {
            return byWhoAmI.data.internalemailaddress.trim();
          }
        }
      }
    }
  } catch {
    // ignore Xrm WebApi execution issues
  }

  // Dataverse WhoAmI via Power data client -> systemusers.internalemailaddress
  try {
    const client = getClient(dataSourcesInfo);
    const whoAmIRequest = {
      dataverseRequest: {
        action: 'WhoAmI',
        parameters: {},
      },
    } as unknown as Parameters<typeof client.executeAsync>[0];
    const whoAmIResult = await client.executeAsync(whoAmIRequest) as {
      success?: boolean;
      data?: { UserId?: string };
    };
    const whoAmIUserId = whoAmIResult.data?.UserId?.replace(/[{}]/g, '').trim();
    if (whoAmIResult.success !== false && whoAmIUserId) {
      const byWhoAmI = await SystemusersService.get(whoAmIUserId, {
        select: ['internalemailaddress'],
      });
      if (byWhoAmI.success && byWhoAmI.data?.internalemailaddress && isEmail(byWhoAmI.data.internalemailaddress)) {
        return byWhoAmI.data.internalemailaddress.trim();
      }
    }
  } catch {
    // ignore WhoAmI context errors
  }

  // Optional source: Office profile if connector is configured.
  try {
    const profile = await Office365UsersService.MyProfile_V2();
    if (profile.success && profile.data) {
      const p = profile.data as unknown as { mail?: string; userPrincipalName?: string };
      if (p.mail && isEmail(p.mail)) return p.mail.trim();
      if (p.userPrincipalName && isEmail(p.userPrincipalName)) return p.userPrincipalName.trim();
    }
  } catch {
    // connector may be unavailable in this environment
  }

  return undefined;
}

export function SupervisorApprovalPage() {
  const [items, setItems] = useState<Vsi_participantprogramyears[]>([]);
  const [queueWorkByEnrolmentId, setQueueWorkByEnrolmentId] = useState<Record<string, QueueWorkMeta>>({});
  const [workerAvatarUrls, setWorkerAvatarUrls] = useState<Record<string, string>>({});
  const fetchedQueueIds = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [currentUser, setCurrentUser] = useState<{ systemUserId: string; displayName: string } | null>(null);
  const [pickingRowId, setPickingRowId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<SupervisorColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [colDragIdx, setColDragIdx] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SupervisorColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [columnWidths, setColumnWidths] = useState<Partial<Record<SupervisorColumnKey, number>>>({});
  const [columnFilters, setColumnFilters] = useState<Record<SupervisorColumnKey, Set<string>>>(() => createEmptyFilters());
  const [columnFilterOps, setColumnFilterOps] = useState<Record<SupervisorColumnKey, FilterOperator>>(DEFAULT_FILTER_OPS);

  const lookupSystemUserByEmail = async (email: string) => {
    const escaped = email.replace(/'/g, "''");
    const result = await SystemusersService.getAll({
      select: ['systemuserid', 'fullname', 'internalemailaddress', 'domainname'],
      filter: `internalemailaddress eq '${escaped}' and isdisabled eq false`,
      maxPageSize: 1,
    });
    if (!result.success || !result.data?.[0]?.systemuserid) return null;
    return result.data[0];
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (currentUser) return;
        const autoEmail = await resolveAuthenticatedEmail();
        if (autoEmail) {
          const u = await lookupSystemUserByEmail(autoEmail);
          if (!cancelled && u?.systemuserid) {
            setCurrentUser({ systemUserId: u.systemuserid, displayName: u.fullname ?? 'Me' });
            return;
          }
        }
      } catch {
        // silently fail
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

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
            'vsi_enrolmentstatus',
            'vsi_calculatedenfee',
            'vsi_previousyearcalculatedenfee',
            'vsi_taskstatus',
            'modifiedon',
          ],
          filter: "vsi_taskstatus eq 865520001",
          orderBy: ['modifiedon desc'],
          maxPageSize: 5000,
        });

        const queueitemsResult = await QueueitemsService.getAll({
          select: [
            'queueitemid',
            '_objectid_value',
            '_workerid_value',
            '_queueid_value',
            'enteredon',
            'workeridmodifiedon',
            'statecode',
          ],
          maxPageSize: 5000,
        });

        const queueMap: Record<string, QueueWorkMeta> = {};
        if (queueitemsResult.success) {
          for (const q of queueitemsResult.data ?? []) {
            const enrolmentId = q._objectid_value;
            if (!enrolmentId) continue;
            const isActive = q.statecode === 0;
            const existing = queueMap[enrolmentId];
            // Prefer active queueitems; otherwise keep first seen.
            if (existing && (existing.isActive || !isActive)) continue;
            const workerDisplayName = (q as unknown as Record<string, unknown>)['_workerid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined;
            const queueDisplayName = (q as unknown as Record<string, unknown>)['_queueid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined;
            queueMap[enrolmentId] = {
              workedBy: workerDisplayName ?? '—',
              workedOn: formatWorkedOn(q.workeridmodifiedon),
              workedOnRaw: q.workeridmodifiedon,
              enteredQueue: formatWorkedOn(q.enteredon),
              enteredQueueRaw: q.enteredon,
              workerId: q._workerid_value,
              queueitemId: q.queueitemid,
              queueId: q._queueid_value,
              queueName: queueDisplayName,
              isActive,
            };
          }
        }

        if (!cancelled) {
          if (!result.success) {
            setItems([]);
            setError(result.error?.message ?? 'Unable to load supervisor approval items.');
          } else {
            setItems(result.data ?? []);
          }

          setQueueWorkByEnrolmentId(queueMap);
          if (!queueitemsResult.success) {
            setError(queueitemsResult.error?.message ?? 'Unable to load queue work metadata.');
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const workerIds = [...new Set(
      Object.values(queueWorkByEnrolmentId)
        .map(m => m.workerId)
        .filter((id): id is string => !!id)
    )];
    if (workerIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries: [string, string][] = [];
      for (const id of workerIds) {
        if (cancelled) break;
        const result = await Office365UsersService.UserPhoto_V2(id);
        if (!cancelled && result.success && result.data) {
          entries.push([id, result.data]);
        }
      }
      if (!cancelled && entries.length > 0) {
        setWorkerAvatarUrls(prev => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    })();
    return () => { cancelled = true; };
  }, [queueWorkByEnrolmentId]);

  // Per-row fallback: for items not resolved by the bulk fetch, query individually
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;

    const missingIds = items
      .map(item => item.vsi_participantprogramyearid)
      .filter((id): id is string => !!id && !fetchedQueueIds.current.has(id));

    if (missingIds.length === 0) return;
    missingIds.forEach(id => fetchedQueueIds.current.add(id));

    (async () => {
      const updates: Record<string, QueueWorkMeta> = {};
      for (const enrolmentId of missingIds) {
        if (cancelled) break;
        const result = await QueueitemsService.getAll({
          select: ['queueitemid', '_objectid_value', '_workerid_value', '_queueid_value', 'enteredon', 'workeridmodifiedon'],
          filter: `objectid_vsi_participantprogramyear/vsi_participantprogramyearid eq '${enrolmentId}' and statecode eq 0`,
          maxPageSize: 1,
        });
        if (!cancelled && result.success && (result.data?.length ?? 0) > 0) {
          const q = result.data![0];
          const workerDisplayName = (q as unknown as Record<string, unknown>)['_workerid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined;
          const queueDisplayName = (q as unknown as Record<string, unknown>)['_queueid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined;
          updates[enrolmentId] = {
            workedBy: workerDisplayName ?? '—',
            workedOn: formatWorkedOn(q.workeridmodifiedon),
            workedOnRaw: q.workeridmodifiedon,
            enteredQueue: formatWorkedOn(q.enteredon),
            enteredQueueRaw: q.enteredon,
            workerId: q._workerid_value,
            queueitemId: q.queueitemid,
            queueId: q._queueid_value,
            queueName: queueDisplayName,
            isActive: true,
          };
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setQueueWorkByEnrolmentId(prev => ({ ...prev, ...updates }));
      }
    })();

    return () => { cancelled = true; };
  }, [items]);

  const resolveCurrentUser = async (): Promise<{ systemUserId: string; displayName: string }> => {
    if (currentUser) return currentUser;
    // Resolve via authenticated user email against internalemailaddress only.
    const autoEmail = await resolveAuthenticatedEmail();
    if (autoEmail) {
      const u = await lookupSystemUserByEmail(autoEmail);
      if (u?.systemuserid) {
        const resolved = { systemUserId: u.systemuserid, displayName: u.fullname ?? 'Me' };
        setCurrentUser(resolved);
        return resolved;
      }
    }

    throw new Error('Could not determine authenticated user email.');
  };

  const handlePick = async (row: SupervisorRowView) => {
    if (!row.workMeta?.queueitemId || !row.itemId) return;
    setPickingRowId(row.itemId);
    setPickError(null);
    try {
      const user = await resolveCurrentUser();
      let updateResult = await QueueitemsService.update(row.workMeta.queueitemId, {
        'workerid_systemuser@odata.bind': `/systemusers(${user.systemUserId})`,
      } as unknown as Parameters<typeof QueueitemsService.update>[1]);
      if (!updateResult.success) {
        updateResult = await QueueitemsService.update(row.workMeta.queueitemId, {
          'WorkerId@odata.bind': `/systemusers(${user.systemUserId})`,
        } as Parameters<typeof QueueitemsService.update>[1]);
      }
      if (!updateResult.success) {
        throw new Error(updateResult.error?.message ?? 'Failed to update queue item worker.');
      }
      setQueueWorkByEnrolmentId(prev => ({
        ...prev,
        [row.itemId!]: {
          ...prev[row.itemId!],
          workedBy: user.displayName,
          workedOn: new Date().toLocaleDateString(),
          workedOnRaw: new Date().toISOString(),
          workerId: user.systemUserId,
        },
      }));
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Pick failed');
    } finally {
      setPickingRowId(null);
    }
  };

  const onSort = (key: SupervisorColumnKey, dir: SortDir) => {
    setSortKey(key);
    setSortDir(dir);
  };

  const onColumnWidthChange = (key: SupervisorColumnKey) => (width: number | undefined) => {
    setColumnWidths(prev => ({ ...prev, [key]: width }));
  };

  const onColDragStart = (index: number) => {
    setColDragIdx(index);
  };

  const onColDragOver = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (colDragIdx === null || colDragIdx === index) return;

    setColumnOrder(prev => {
      const next = [...prev];
      const [moved] = next.splice(colDragIdx, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setColDragIdx(index);
  };

  const onColDragEnd = () => {
    setColDragIdx(null);
  };

  type SupervisorRowView = {
    item: Vsi_participantprogramyears;
    itemId: string | null;
    workMeta: QueueWorkMeta | undefined;
    enrolmentName: string;
    participantName: string;
    taskStatusLabel: string;
    enrolmentStatusLabel: string;
    calculatedFeeValue: number | null;
    enteredQueue: string;
    enteredQueueRaw?: string;
    workedBy: string;
    workedOn: string;
    workedOnRaw?: string;
  };

  const allRows = useMemo<SupervisorRowView[]>(() => {
    return items.map(item => {
      const itemId = getRowId(item);
      const workMeta = itemId ? queueWorkByEnrolmentId[itemId] : undefined;
      const rawItem = item as unknown as Record<string, unknown>;
      const participantDisplayName = (rawItem['_vsi_participantid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined)
        ?? item.vsi_participantidname
        ?? '—';
      return {
        item,
        itemId,
        workMeta,
        enrolmentName: item.vsi_name ?? '—',
        participantName: participantDisplayName,
        taskStatusLabel: getTaskStatusLabel(item.vsi_taskstatus) || 'Unknown',
        enrolmentStatusLabel: getEnrolmentStatusLabel(item.vsi_enrolmentstatus) || '—',
        calculatedFeeValue: item.vsi_calculatedenfee ?? null,
        enteredQueue: workMeta?.enteredQueue ?? '—',
        enteredQueueRaw: workMeta?.enteredQueueRaw,
        workedBy: workMeta?.workedBy ?? '—',
        workedOn: workMeta?.workedOn ?? '—',
        workedOnRaw: workMeta?.workedOnRaw,
      };
    });
  }, [items, queueWorkByEnrolmentId]);

  const filterValue = (row: SupervisorRowView, key: SupervisorColumnKey): string => {
    switch (key) {
      case 'enrolmentName':
        return row.enrolmentName;
      case 'participant':
        return row.participantName;
      case 'taskStatus':
        return row.taskStatusLabel;
      case 'enrolmentStatus':
        return row.enrolmentStatusLabel;
      case 'calculatedFee':
        return formatCurrencyOr(row.calculatedFeeValue, '—');
      case 'enteredQueue':
        return row.enteredQueue;
      case 'workedBy':
        return row.workedBy;
      case 'workedOn':
        return row.workedOn;
      default:
        return '—';
    }
  };

  const filterOptionsByColumn = useMemo<Record<SupervisorColumnKey, string[]>>(() => {
    const buckets: Record<SupervisorColumnKey, Set<string>> = {
      enrolmentName: new Set(),
      participant: new Set(),
      taskStatus: new Set(),
      enrolmentStatus: new Set(),
      calculatedFee: new Set(),
      enteredQueue: new Set(),
      workedBy: new Set(),
      workedOn: new Set(),
    };

    for (const row of allRows) {
      (Object.keys(buckets) as SupervisorColumnKey[]).forEach(key => {
        buckets[key].add(filterValue(row, key));
      });
    }

    return {
      enrolmentName: [...buckets.enrolmentName].sort((a, b) => a.localeCompare(b)),
      participant: [...buckets.participant].sort((a, b) => a.localeCompare(b)),
      taskStatus: [...buckets.taskStatus].sort((a, b) => a.localeCompare(b)),
      enrolmentStatus: ENROLMENT_STATUS_FILTER_OPTIONS,
      calculatedFee: [...buckets.calculatedFee].sort((a, b) => a.localeCompare(b)),
      enteredQueue: [...buckets.enteredQueue].sort((a, b) => a.localeCompare(b)),
      workedBy: [...buckets.workedBy].sort((a, b) => a.localeCompare(b)),
      workedOn: [...buckets.workedOn].sort((a, b) => a.localeCompare(b)),
    };
  }, [allRows]);

  const filteredAndSortedRows = useMemo(() => {
    const filtered = allRows.filter(row => {
      for (const key of Object.keys(columnFilters) as SupervisorColumnKey[]) {
        const selected = columnFilters[key];
        if (selected.size === 0) continue;
        const value = filterValue(row, key);
        const hasValue = selected.has(value);
        const pass = columnFilterOps[key] === 'equals' ? hasValue : !hasValue;
        if (!pass) return false;
      }
      return true;
    });

    if (!sortKey) return filtered;

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'calculatedFee': {
          const av = a.calculatedFeeValue ?? Number.NEGATIVE_INFINITY;
          const bv = b.calculatedFeeValue ?? Number.NEGATIVE_INFINITY;
          cmp = av - bv;
          break;
        }
        case 'workedOn': {
          const at = a.workedOnRaw ? new Date(a.workedOnRaw).getTime() : Number.NEGATIVE_INFINITY;
          const bt = b.workedOnRaw ? new Date(b.workedOnRaw).getTime() : Number.NEGATIVE_INFINITY;
          cmp = at - bt;
          break;
        }
        case 'enteredQueue': {
          const at = a.enteredQueueRaw ? new Date(a.enteredQueueRaw).getTime() : Number.NEGATIVE_INFINITY;
          const bt = b.enteredQueueRaw ? new Date(b.enteredQueueRaw).getTime() : Number.NEGATIVE_INFINITY;
          cmp = at - bt;
          break;
        }
        case 'enrolmentName':
          cmp = a.enrolmentName.localeCompare(b.enrolmentName);
          break;
        case 'participant':
          cmp = a.participantName.localeCompare(b.participantName);
          break;
        case 'taskStatus':
          cmp = a.taskStatusLabel.localeCompare(b.taskStatusLabel);
          break;
        case 'enrolmentStatus':
          cmp = a.enrolmentStatusLabel.localeCompare(b.enrolmentStatusLabel);
          break;
        case 'workedBy':
          cmp = a.workedBy.localeCompare(b.workedBy);
          break;
        default:
          cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [allRows, columnFilterOps, columnFilters, sortDir, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRows.length / PAGE_SIZE));
  const pageRows = filteredAndSortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(prev => Math.min(prev, totalPages));
  }, [totalPages]);

  const allSelected =
    pageRows.length > 0 && pageRows.every(row => {
      return row.itemId != null && selectedIds.has(row.itemId);
    });

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        pageRows.forEach(row => {
          const itemId = row.itemId;
          if (itemId != null) next.delete(itemId);
        });
      } else {
        pageRows.forEach(row => {
          const itemId = row.itemId;
          if (itemId != null) next.add(itemId);
        });
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="sa-wrapper">
      <div>
        <h1 className="sa-page-title">Supervisor&rsquo;s Approval Queue</h1>
        <p className="sa-page-subtitle">
          Review and manage pending approval items, update task statuses, and ensure timely processing.
        </p>
      </div>

      <div className="sa-filters-bar">
        <button type="button" className="sa-filter-btn">
          <Filter size={14} />
          Filters
        </button>
      </div>

      <div className="sa-card">
        <div className="sa-card-header">
          <div className="sa-card-title-block">
            <h2 className="sa-card-title">Pending Reviews</h2>
            <p className="sa-card-subtitle">Items requiring your attention, referred by admin(s)</p>
          </div>
          <div className="sa-bulk-actions">
            <button type="button" className="sa-btn-secondary">Bulk Actions</button>
            <button
              type="button"
              className="sa-btn-primary"
              disabled={selectedCount === 0}
            >
              Approve Selected{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
          </div>
        </div>

        <div className="sa-table-container">
          {loading && <p className="sa-state-msg loading">Loading queue items…</p>}
          {error && <p className="sa-state-msg error">Error: {error}</p>}
          {pickError && (
            <p className="sa-state-msg error" style={{ cursor: 'pointer' }} onClick={() => setPickError(null)}>
              Pick failed: {pickError} &times;
            </p>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="sa-state-msg empty">No pending items in the supervisor approval queue.</p>
          )}
          {!loading && !error && items.length > 0 && (
            <table className="sa-table">
              <thead>
                <tr>
                  <th className="sa-th-check">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  {columnOrder.map((key, index) => {
                    const colDef = SUPERVISOR_COLUMNS.find(c => c.key === key)!;
                    return (
                      <ColumnHeaderMenu
                        key={key}
                        label={colDef.label}
                        sortKey={key}
                        currentSortKey={sortKey}
                        currentSortDir={sortDir}
                        onSort={(k, dir) => onSort(k as SupervisorColumnKey, dir)}
                        columnWidth={columnWidths[key]}
                        onColumnWidthChange={onColumnWidthChange(key)}
                        filterOptions={filterOptionsByColumn[key]}
                        selectedFilters={columnFilters[key]}
                        filterOperator={columnFilterOps[key]}
                        onFilterChange={next => setColumnFilters(prev => ({ ...prev, [key]: new Set(next) }))}
                        onFilterOperatorChange={op => setColumnFilterOps(prev => ({ ...prev, [key]: op }))}
                        dragProps={{
                          draggable: true,
                          onDragStart: () => onColDragStart(index),
                          onDragOver: (event: DragEvent) => onColDragOver(event, index),
                          onDragEnd: onColDragEnd,
                          className: colDragIdx === index ? 'col-dragging' : undefined,
                        }}
                      />
                    );
                  })}
                  <th className="sa-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, index) => {
                  const item = row.item;
                  const itemId = row.itemId;
                  const hasCalculatedFee = item.vsi_calculatedenfee != null;
                  const variance = calculateVariance(item.vsi_calculatedenfee, item.vsi_previousyearcalculatedenfee);
                  const workMeta = row.workMeta;

                  return (
                    <tr key={itemId ?? `${item.vsi_name ?? 'row'}-${index}`}>
                      <td className="sa-td-check">
                        <input
                          type="checkbox"
                          checked={itemId != null && selectedIds.has(itemId)}
                          onChange={() => {
                            if (itemId != null) toggleSelect(itemId);
                          }}
                          aria-label={`Select ${item.vsi_name ?? itemId ?? 'row'}`}
                          disabled={itemId == null}
                        />
                      </td>
                      {columnOrder.map(key => {
                        if (key === 'enrolmentName') {
                          return <td key={key} className="sa-pin">{item.vsi_name ?? '—'}</td>;
                        }
                        if (key === 'participant') {
                          return <td key={key}>{row.participantName}</td>;
                        }
                        if (key === 'taskStatus') {
                          return (
                            <td key={key}>
                              <StatusBadge status={item.vsi_taskstatus} />
                            </td>
                          );
                        }
                        if (key === 'enrolmentStatus') {
                          const statusLabel = getEnrolmentStatusLabel(item.vsi_enrolmentstatus);
                          return (
                            <td key={key}>
                              <span className={`enrol-badge ${enrolmentStatusClass(statusLabel)}`}>{statusLabel || '—'}</span>
                            </td>
                          );
                        }
                        if (key === 'calculatedFee') {
                          return (
                            <td key={key}>
                              <span className="sa-fee-cell">
                                {itemId && hasCalculatedFee
                                  ? <Link className="sa-fee-amount sa-fee-link" to={`/calculation/${itemId}`}>{formatCurrencyOr(item.vsi_calculatedenfee, '—')}</Link>
                                  : <span className="sa-fee-amount">{formatCurrencyOr(item.vsi_calculatedenfee, '—')}</span>}
                                {variance != null ? <VariancePill variance={variance} /> : null}
                              </span>
                            </td>
                          );
                        }
                        if (key === 'enteredQueue') {
                          return <td key={key}>{workMeta?.enteredQueue ?? '—'}</td>;
                        }
                        if (key === 'workedBy') {
                          return (
                            <td key={key} className="sa-worked-by-cell">
                              {!workMeta || workMeta.workedBy === '—'
                                ? '—'
                                : (
                                  <span className="sa-worked-by-content">
                                    {workMeta.workerId && workerAvatarUrls[workMeta.workerId]
                                      ? <img className="avatar-circle" src={`data:image/jpeg;base64,${workerAvatarUrls[workMeta.workerId]}`} alt={workMeta.workedBy} title={workMeta.workedBy} />
                                      : <span className="avatar-circle" title={workMeta.workedBy}>{getInitials(workMeta.workedBy)}</span>}
                                    <span className="sa-worked-by-name">{workMeta.workedBy}</span>
                                  </span>
                                )}
                            </td>
                          );
                        }
                        return <td key={key}>{workMeta?.workedOn ?? '—'}</td>;
                      })}
                      <td className="sa-td-actions">
                        <div className="sa-row-actions">
                          <button
                            type="button"
                            className="sa-action-btn"
                            disabled={!itemId || !workMeta?.queueitemId || pickingRowId === itemId}
                            onClick={() => void handlePick(row)}
                          >{pickingRowId === itemId ? '…' : 'Pick'}</button>
                          <button
                          type="button"
                          className="sa-action-btn"
                          disabled={!itemId}
                          onClick={() => {
                            if (itemId) setAssignTarget({
                              enrolmentId: itemId,
                              enrolmentName: item.vsi_name ?? '—',
                              queueitemId: workMeta?.queueitemId,
                              queueId: workMeta?.queueId,
                              queueName: workMeta?.queueName,
                            });
                          }}
                        >Assign</button>
                          {itemId
                            ? <Link className="sa-action-btn sa-action-link" to={`/calculation/${itemId}`}>Go to calculation</Link>
                            : <button type="button" className="sa-action-btn" disabled>Go to calculation</button>}
                          <button type="button" className="sa-action-btn sa-action-ready">Approve</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {!loading && !error && items.length > 0 && filteredAndSortedRows.length === 0 && (
            <p className="sa-state-msg empty">No records match the current filters.</p>
          )}
        </div>

        {!loading && !error && items.length > 0 && (
          <div className="sa-pagination">
            <span>
              {filteredAndSortedRows.length === 0
                ? 'Showing 0 of 0 results'
                : `Showing ${Math.min((page - 1) * PAGE_SIZE + 1, filteredAndSortedRows.length)}–${Math.min(page * PAGE_SIZE, filteredAndSortedRows.length)} of ${filteredAndSortedRows.length} result${filteredAndSortedRows.length !== 1 ? 's' : ''}`}
            </span>
            <div className="sa-pagination-controls">
              <button
                type="button"
                className="sa-page-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                &lsaquo; Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  type="button"
                  className={`sa-page-btn${p === page ? ' active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="sa-page-btn"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next &rsaquo;
              </button>
            </div>
          </div>
        )}
      </div>

      {assignTarget && (
        <AssignWorkerModal
          enrolmentName={assignTarget.enrolmentName}
          queueitemId={assignTarget.queueitemId}
          queueId={assignTarget.queueId}
          queueName={assignTarget.queueName}
          onClose={() => setAssignTarget(null)}
          onAssigned={(workerId, workerName) => {
            setQueueWorkByEnrolmentId(prev => ({
              ...prev,
              [assignTarget.enrolmentId]: {
                ...prev[assignTarget.enrolmentId],
                workedBy: workerName,
                workedOn: new Date().toLocaleDateString(),
                workerId,
              },
            }));
            setAssignTarget(null);
          }}
        />
      )}
    </div>
  );
}

