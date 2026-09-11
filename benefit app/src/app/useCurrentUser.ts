import { useEffect, useMemo, useState } from 'react';
import { getClient } from '@microsoft/power-apps/data';

import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

const CACHE_KEY = 'benefit-app:current-user';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type WhoAmIResponse = {
  UserId: string;
  BusinessUnitId: string;
  OrganizationId: string;
};

type SystemUser = {
  systemuserid: string;
  fullname: string | null;
  internalemailaddress: string | null;
};

type CachedUser = {
  userId: string;
  name: string | null;
  email: string | null;
  ts: number;
};

export type CurrentUser = {
  name: string | null;
  email: string | null;
  initials: string;
  loading: boolean;
};

function computeInitials(name: string | null, email: string | null): string {
  const source = (name?.trim() || email?.split('@')[0] || '').trim();
  if (!source) return '';

  const parts = source
    .replace(/[_.-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function readCache(): CachedUser | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedUser;
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(entry: CachedUser): void {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // sessionStorage may be unavailable (privacy mode, sandboxed iframe, etc.); ignore.
  }
}

async function fetchCurrentUser(): Promise<CachedUser | null> {
  const client = getClient(dataSourcesInfo);

  const whoResult = await client.executeAsync<unknown, WhoAmIResponse>({
    dataverseRequest: {
      action: 'customapi',
      parameters: {
        operationName: 'WhoAmI',
        tableName: 'whoami',
        body: {},
      },
    },
  });

  if (!whoResult.success || !whoResult.data?.UserId) {
    return null;
  }

  const userId = whoResult.data.UserId;

  const userResult = await client.retrieveRecordAsync<SystemUser>(
    'systemusers',
    userId,
    { select: ['fullname', 'internalemailaddress'] },
  );

  if (!userResult.success || !userResult.data) {
    return { userId, name: null, email: null, ts: Date.now() };
  }

  return {
    userId,
    name: userResult.data.fullname ?? null,
    email: userResult.data.internalemailaddress ?? null,
    ts: Date.now(),
  };
}

export function useCurrentUser(): CurrentUser {
  const cached = useMemo(() => readCache(), []);
  const [state, setState] = useState<CachedUser | null>(cached);
  const [loading, setLoading] = useState<boolean>(cached === null);

  useEffect(() => {
    if (cached) return;

    let cancelled = false;

    fetchCurrentUser()
      .then((result) => {
        if (cancelled) return;
        if (result) {
          writeCache(result);
          setState(result);
        }
      })
      .catch(() => {
        // Swallow errors — running outside Dataverse (e.g. vite dev preview) has no runtime.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cached]);

  return {
    name: state?.name ?? null,
    email: state?.email ?? null,
    initials: computeInitials(state?.name ?? null, state?.email ?? null),
    loading,
  };
}
