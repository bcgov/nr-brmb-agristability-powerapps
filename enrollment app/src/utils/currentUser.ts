import { SystemusersService } from '../generated/services/SystemusersService';

export type ResolvedCurrentUser = {
  systemUserId: string;
  displayName: string;
  email?: string;
};

type XrmUserSettings = { userId?: string; userName?: string; userPrincipalName?: string };
type WinWithXrm = { Xrm?: { Utility?: { getGlobalContext?: () => { userSettings?: XrmUserSettings } } } };

function getXrmUserSettings(): XrmUserSettings | undefined {
  try {
    const candidates = [window, window.parent, window.top];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const settings = (candidate as unknown as WinWithXrm).Xrm?.Utility?.getGlobalContext?.()?.userSettings;
      if (settings?.userId || settings?.userName || settings?.userPrincipalName) {
        return settings;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function normalizeGuid(value?: string | null): string {
  return (value ?? '').replace(/[{}]/g, '').trim().toLowerCase();
}

function isGuid(value?: string): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function isEmail(value?: string): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value.trim());
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
  const candidates = [claims.preferred_username, claims.upn, claims.email, claims.unique_name];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && isEmail(candidate)) return candidate.trim();
  }
  return undefined;
}

function findEmailInStorage(storage: Storage): string | undefined {
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;

    const raw = storage.getItem(key);
    if (!raw) continue;

    const direct = emailFromClaims(decodeJwtPayload(raw));
    if (direct) return direct;

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const claimBased = emailFromClaims(parsed);
      if (claimBased) return claimBased;

      const tokenCandidates = [parsed.secret, parsed.idToken, parsed.id_token, parsed.accessToken, parsed.access_token];
      for (const tokenValue of tokenCandidates) {
        if (typeof tokenValue !== 'string') continue;
        const tokenEmail = emailFromClaims(decodeJwtPayload(tokenValue));
        if (tokenEmail) return tokenEmail;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function getEmailFromUrlContext(): string | undefined {
  try {
    const url = new URL(window.location.href);
    const keys = ['login_hint', 'upn', 'email', 'userPrincipalName', 'username'];
    for (const key of keys) {
      const queryValue = url.searchParams.get(key);
      if (queryValue && isEmail(queryValue)) return queryValue.trim();

      const hashValue = new URLSearchParams(url.hash.replace(/^#/, '')).get(key);
      if (hashValue && isEmail(hashValue)) return hashValue.trim();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function findEmailInUnknown(value: unknown, depth: number, seen: WeakSet<object>): string | undefined {
  if (depth <= 0 || value == null) return undefined;
  if (typeof value === 'string') return isEmail(value) ? value.trim() : undefined;
  if (typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  if (seen.has(record)) return undefined;
  seen.add(record);

  for (const [key, nestedValue] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.includes('email') || normalizedKey.includes('upn') || normalizedKey.includes('username') || normalizedKey.includes('login') || normalizedKey.includes('userprincipalname')) {
      const foundByKey = findEmailInUnknown(nestedValue, depth - 1, seen);
      if (foundByKey) return foundByKey;
    }
  }

  for (const nestedValue of Object.values(record)) {
    const foundNested = findEmailInUnknown(nestedValue, depth - 1, seen);
    if (foundNested) return foundNested;
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
    return undefined;
  }

  return undefined;
}

async function lookupSystemUserByEmail(email: string): Promise<ResolvedCurrentUser | null> {
  const escaped = email.replace(/'/g, "''");
  const result = await SystemusersService.getAll({
    select: ['systemuserid', 'fullname', 'internalemailaddress', 'domainname'],
    filter: `internalemailaddress eq '${escaped}' and isdisabled eq false`,
    maxPageSize: 1,
  });

  const user = result.success ? result.data?.[0] : undefined;
  if (!user?.systemuserid) return null;

  return {
    systemUserId: user.systemuserid,
    displayName: user.fullname ?? user.domainname ?? email,
    email: user.internalemailaddress ?? email,
  };
}

async function lookupSystemUserById(userId: string, fallbackName?: string): Promise<ResolvedCurrentUser | null> {
  const normalizedId = normalizeGuid(userId);
  if (!isGuid(normalizedId)) return null;

  const result = await SystemusersService.get(normalizedId, {
    select: ['systemuserid', 'fullname', 'internalemailaddress', 'domainname'],
  });

  const user = result.success ? result.data : undefined;
  if (!user?.systemuserid) {
    return {
      systemUserId: normalizedId,
      displayName: fallbackName?.trim() || 'Me',
    };
  }

  return {
    systemUserId: user.systemuserid,
    displayName: user.fullname ?? fallbackName?.trim() ?? user.domainname ?? 'Me',
    email: user.internalemailaddress ?? undefined,
  };
}

export async function resolveAuthenticatedEmail(): Promise<string | undefined> {
  const xrmSettings = getXrmUserSettings();
  if (xrmSettings?.userPrincipalName && isEmail(xrmSettings.userPrincipalName)) {
    return xrmSettings.userPrincipalName.trim();
  }

  if (xrmSettings?.userName && isEmail(xrmSettings.userName)) {
    return xrmSettings.userName.trim();
  }

  try {
    const localEmail = findEmailInStorage(window.localStorage);
    if (localEmail) return localEmail;
  } catch {
    return getEmailFromUrlContext() ?? getEmailFromGlobalContextProbe();
  }

  try {
    const sessionEmail = findEmailInStorage(window.sessionStorage);
    if (sessionEmail) return sessionEmail;
  } catch {
    return getEmailFromUrlContext() ?? getEmailFromGlobalContextProbe();
  }

  return getEmailFromUrlContext() ?? getEmailFromGlobalContextProbe();
}

export async function resolveCurrentSystemUser(): Promise<ResolvedCurrentUser> {
  const xrmSettings = getXrmUserSettings();
  if (xrmSettings?.userId) {
    const byId = await lookupSystemUserById(xrmSettings.userId, xrmSettings.userName);
    if (byId) return byId;
  }

  const email = await resolveAuthenticatedEmail();
  if (email) {
    const byEmail = await lookupSystemUserByEmail(email);
    if (byEmail) return byEmail;
  }

  throw new Error('Could not determine the authenticated system user.');
}