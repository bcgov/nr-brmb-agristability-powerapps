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
