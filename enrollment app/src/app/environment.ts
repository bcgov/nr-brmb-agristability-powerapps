import { Vsi_armsconfigurationsService } from '../generated/services/Vsi_armsconfigurationsService';

const DASHBOARD_URL_FALLBACK = 'https://app.powerbi.com/groups/b447b3b3-d200-43ee-b3cd-eabccd22a717/reports/a14e5dfe-22ca-4974-a97b-844a5050fb64';

let environmentNameCache: string | null = null;
let environmentNameLoaded = false;

function normalizeRequired(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error('Missing required dashboard configuration value.');
  }
  return normalized;
}

function isActiveConfiguration(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

function hasPowerBiIds(row: { vsi_powerbireportgroupid?: string; vsi_powerbiendashboardreportid?: string }): boolean {
  return !!row.vsi_powerbireportgroupid?.trim() && !!row.vsi_powerbiendashboardreportid?.trim();
}

export function getEnvironmentKey(environmentName: string): 'dev' | 'test' | 'prod' | 'default' {
  const normalized = environmentName.trim().toLowerCase();
  if (normalized.includes('tprod') || normalized.includes('test')) return 'test';
  if (normalized.includes('prod')) return 'prod';
  if (normalized.includes('dev') || normalized.includes('local') || normalized.includes('sandbox')) return 'dev';
  return 'default';
}

export function getBannerTitle(environmentName: string): string {
  const environmentKey = getEnvironmentKey(environmentName);
  return environmentKey === 'prod' ? 'ENROLMENT' : `ENROLMENT ${environmentName.toUpperCase()}`;
}

export async function getEnvironmentName(): Promise<string | null> {
  if (environmentNameLoaded) return environmentNameCache;

  const result = await Vsi_armsconfigurationsService.getAll({
    maxPageSize: 50,
    orderBy: ['modifiedon desc'],
    select: ['vsi_activeconfiguration', 'vsi_environment'],
  });

  const rows = result.data ?? [];
  const activeRow = rows.find(row => isActiveConfiguration((row as { vsi_activeconfiguration?: unknown }).vsi_activeconfiguration) && row.vsi_environment?.trim());
  const configuredRow = activeRow ?? rows.find(row => row.vsi_environment?.trim());
  environmentNameCache = configuredRow?.vsi_environment?.trim() ?? null;
  environmentNameLoaded = true;

  return environmentNameCache;
}

export async function getPowerBiDashboardUrl(): Promise<string> {
  const result = await Vsi_armsconfigurationsService.getAll({
    maxPageSize: 50,
    orderBy: ['modifiedon desc'],
    select: [
      'vsi_activeconfiguration',
      'vsi_powerbireportgroupid',
      'vsi_powerbiendashboardreportid',
    ],
  });

  const rows = result.data ?? [];
  const activeRow = rows.find(row => isActiveConfiguration((row as { vsi_activeconfiguration?: unknown }).vsi_activeconfiguration) && hasPowerBiIds(row));
  const configuredRow = activeRow ?? rows.find(row => hasPowerBiIds(row));
  if (!configuredRow) return DASHBOARD_URL_FALLBACK;

  const groupId = normalizeRequired(configuredRow.vsi_powerbireportgroupid);
  const reportId = normalizeRequired(configuredRow.vsi_powerbiendashboardreportid);
  return `https://app.powerbi.com/groups/${groupId}/reports/${reportId}`;
}

export function clearEnvironmentNameCache() {
  environmentNameCache = null;
  environmentNameLoaded = false;
}

export { DASHBOARD_URL_FALLBACK };
