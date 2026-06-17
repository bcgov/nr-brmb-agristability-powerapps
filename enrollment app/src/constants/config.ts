/**
 * Fallback values used when runtime Dataverse configuration is unavailable.
 * These are environment-specific defaults for the dev environment and are
 * overridden at runtime by values fetched from Vsi_armsconfigurationsService.
 */
export const CORE_APP_ID_FALLBACK = '88c024d9-9fd5-ec11-a7b5-002248ada475';
export const CORE_BASE_URL_FALLBACK = 'https://aff-brmb-crm-dev.crm3.dynamics.com/main.aspx';
export const DATAVERSE_ORG_URL = 'https://aff-brmb-crm-dev.crm3.dynamics.com/';
export const DATAVERSE_ORG_URL_FALLBACK = DATAVERSE_ORG_URL;
