import powerConfig from '../../power.config.json';
import { Vsi_armsconfigurationsService } from '../generated/services/Vsi_armsconfigurationsService';

const PENDING_ROUTE_KEY = 'pendingDeepLinkRoute';
const PENDING_ROUTE_TTL_MS = 10_000;

type LaunchConfig = {
  environmentId: string;
  tenantId: string;
};

let launchConfigCache: LaunchConfig | null = null;

const ID_PARAM_NAMES = [
  'calculationId',
  'enrolmentId',
  'enrollmentId',
  'participantProgramYearId',
  'vsi_participantprogramyearid',
  'recordId',
  'guid',
];

function decodeValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeEnrolmentId(value: string | null | undefined): string {
  if (!value) return '';

  let normalized = decodeValue(value).trim();
  const keyValueMatch = normalized.match(/^(?:guid|id|recordId|enrolmentId|enrollmentId|calculationId)=([^&?#/]+)/i);
  if (keyValueMatch) {
    normalized = keyValueMatch[1];
  }

  return normalized.replace(/[{}]/g, '').trim();
}

export function buildCoreEntityRecordHref(
  baseUrl: string,
  appId: string,
  entityName: string,
  recordId: string,
): string {
  return `${baseUrl}?appid=${encodeURIComponent(appId)}&pagetype=entityrecord&etn=${encodeURIComponent(entityName)}&id=${encodeURIComponent(recordId)}`;
}

function getFirstIdParam(params: URLSearchParams): string {
  for (const name of ID_PARAM_NAMES) {
    const value = params.get(name);
    if (value) return normalizeEnrolmentId(value);
  }
  return '';
}

function normalizeSource(value: string | null | undefined): string {
  return value?.toLowerCase() === 'supervisor' ? 'supervisor' : 'dashboard';
}

function normalizeRequired(value: string | null | undefined, fieldName: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required core configuration value: ${fieldName}`);
  }
  return normalized;
}

async function loadLaunchConfig(): Promise<LaunchConfig> {
  if (launchConfigCache) return launchConfigCache;

  const result = await Vsi_armsconfigurationsService.getAll({
    maxPageSize: 50,
    select: ['vsi_activeconfiguration', 'vsi_coreenvironmentid', 'vsi_tenantid'],
  });
  const rows = result.data ?? [];
  const activeRow = rows.find(row => row.vsi_activeconfiguration === true);
  if (!activeRow) {
    throw new Error('No active core configuration record found.');
  }

  launchConfigCache = {
    environmentId: normalizeRequired(activeRow.vsi_coreenvironmentid, 'vsi_coreenvironmentid'),
    tenantId: normalizeRequired(activeRow.vsi_tenantid, 'vsi_tenantid'),
  };
  return launchConfigCache;
}

function getRouteSource(params: URLSearchParams): string {
  return normalizeSource(params.get('routeSource') ?? params.get('appSource') ?? params.get('screenSource') ?? params.get('source'));
}

function routeFromSegments(segments: string[]): string | null {
  const routeIndex = segments.findIndex(segment => segment === 'calculation' || segment === 'enrolment');
  if (routeIndex < 0) return null;

  const routeName = segments[routeIndex];
  const first = segments[routeIndex + 1];
  const second = segments[routeIndex + 2];
  if (!first) return null;

  const hasSource = first === 'dashboard' || first === 'supervisor';
  const source = hasSource ? first : 'dashboard';
  const id = normalizeEnrolmentId(hasSource ? second : first);
  return id ? `/${routeName}/${source}/${id}` : null;
}

function routeFromRouteParam(params: URLSearchParams): string | null {
  const routeValue = params.get('route') ?? params.get('path');
  if (!routeValue) return null;

  const route = decodeValue(routeValue).replace(/^#?\/?/, '');
  const segments = route.split('/').filter(Boolean);
  return routeFromSegments(segments);
}

function routeFromPageParams(params: URLSearchParams): string | null {
  const page = params.get('page') ?? params.get('screen') ?? params.get('target') ?? params.get('view');
  const pageName = page?.toLowerCase();
  const routeName = pageName?.includes('calculation')
    ? 'calculation'
    : pageName?.includes('enrolment') || pageName?.includes('enrollment')
      ? 'enrolment'
      : null;

  if (!routeName) return null;
  const id = getFirstIdParam(params);
  return id ? `/${routeName}/${getRouteSource(params)}/${id}` : null;
}

function routeFromExplicitIdParams(params: URLSearchParams): string | null {
  const calculationId = params.get('calculationId') ?? params.get('guid');
  if (calculationId) {
    const id = normalizeEnrolmentId(calculationId);
    return id ? `/calculation/${getRouteSource(params)}/${id}` : null;
  }

  const enrolmentId = params.get('enrolmentId') ?? params.get('enrollmentId') ?? params.get('participantProgramYearId');
  if (enrolmentId) {
    const id = normalizeEnrolmentId(enrolmentId);
    return id ? `/enrolment/${getRouteSource(params)}/${id}` : null;
  }

  return null;
}

export function normalizeInitialDeepLink(): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (url.hash.startsWith('#/')) return;

  // Check for a pending deep-link written by another tab via openInNewTab().
  // The route is stored in localStorage so it works across both local dev and production.
  try {
    const raw = localStorage.getItem(PENDING_ROUTE_KEY);
    if (raw) {
      const { hash, ts } = JSON.parse(raw) as { hash: string; ts: number };
      localStorage.removeItem(PENDING_ROUTE_KEY);
      if (Date.now() - ts < PENDING_ROUTE_TTL_MS && hash.startsWith('#/')) {
        window.history.replaceState(null, '', `${url.pathname}${url.search}${hash}`);
        return;
      }
    }
  } catch { /* localStorage unavailable */ }

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const pathSegments = url.pathname.split('/').map(segment => decodeValue(segment).toLowerCase()).filter(Boolean);

  const route =
    routeFromRouteParam(url.searchParams)
    ?? routeFromPageParams(url.searchParams)
    ?? routeFromExplicitIdParams(url.searchParams)
    ?? routeFromRouteParam(hashParams)
    ?? routeFromPageParams(hashParams)
    ?? routeFromExplicitIdParams(hashParams)
    ?? routeFromSegments(pathSegments);

  if (!route) return;

  window.history.replaceState(null, '', `${url.pathname}${url.search}#${route}`);
}

/**
 * Opens the app in a new tab deep-linked to the given hash route (e.g. "#/calculation/dashboard/abc-123").
 * Writes the route to localStorage so normalizeInitialDeepLink() can pick it up in the new tab,
 * giving real deep-linking in both local dev and production Power Apps.
 */
export async function openInNewTab(hash: string): Promise<void> {
  const route = hash.startsWith('#') ? hash : `#${hash}`;

  // Write the intended route so the new tab can navigate to it on startup.
  try {
    localStorage.setItem(PENDING_ROUTE_KEY, JSON.stringify({ hash: route, ts: Date.now() }));
  } catch { /* localStorage unavailable */ }

  const { environmentId: envId, tenantId } = await loadLaunchConfig();

  if (window.location.hostname === 'localhost') {
    const baseLocal = (powerConfig.localAppUrl as string).replace(/\/$/, '');
    const params = new URLSearchParams({
      _localAppUrl: baseLocal + route,
      _localConnectionUrl: (import.meta.env.VITE_LOCAL_CONNECTION_URL as string | undefined) ?? 'http://localhost:8080',
    });
    window.open(`https://apps.powerapps.com/play/e/${envId}/app/local?${params}`, '_blank', 'noopener,noreferrer');
  } else {
    const params = new URLSearchParams({ source: 'portal', tenantId });
    window.open(`https://apps.powerapps.com/play/e/${envId}/app/${powerConfig.appId}?${params}`, '_blank', 'noopener,noreferrer');
  }
}
