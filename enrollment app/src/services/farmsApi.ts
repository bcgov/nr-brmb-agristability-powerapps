import type { IOperationResult } from '@microsoft/power-apps/data';
import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

type FarmsApiResult<T = unknown> = IOperationResult<T>;

const FARMS_API_DATA_SOURCE_PRIMARY = 'vsi_5ffarms_20api_5f4155bcad29d5d05a';
const FARMS_API_DATA_SOURCE_LEGACY = 'farms_20api_5fe39d1efd21a19d13_5f571039b465579741';
const GET_ENROLMENT_NOTICE_WORKFLOW_CALCULATION = 'GetEnrolmentNoticeWorkflowCalculation';
const GET_ENROLMENT_PARTNERS = 'GetEnrolmentPartners';

function getFarmsNameVariants(name: string): string[] {
  const variants = new Set<string>();
  const trimmed = name.trim();
  if (!trimmed) return [];

  variants.add(trimmed);

  // API ids can appear as shared_xxx-yyy while data source keys are often xxx_yyy.
  const withoutShared = trimmed.startsWith('shared_') ? trimmed.slice('shared_'.length) : trimmed;
  variants.add(withoutShared);
  variants.add(withoutShared.replace(/-/g, '_'));

  const hyphenated = withoutShared.replace(/_/g, '-');
  variants.add(hyphenated);
  variants.add(`shared_${hyphenated}`);

  return Array.from(variants).filter((value) => !!value);
}

function isFarmsDebugEnabled(): boolean {
  try {
    const globalDebug = (globalThis as { __FARMS_DEBUG__?: boolean }).__FARMS_DEBUG__;
    const storageDebug = globalThis.localStorage?.getItem('farmsDebug') === '1';
    return globalDebug === true || storageDebug;
  } catch {
    return false;
  }
}

function farmsDebugLog(message: string, data?: unknown): void {
  if (!isFarmsDebugEnabled()) return;
  if (typeof data === 'undefined') {
    console.debug(`[FARMS DEBUG] ${message}`);
    return;
  }

  console.debug(`[FARMS DEBUG] ${message}`, data);
}

function getErrorMessage(error: unknown): string {
  return String(
    (error as { message?: string } | undefined)?.message ??
    (error as { error?: { message?: string } } | undefined)?.error?.message ??
    error ??
    ''
  );
}

function resolveFarmsDataSourceName() {
  const knownDataSourceNames = [FARMS_API_DATA_SOURCE_PRIMARY, FARMS_API_DATA_SOURCE_LEGACY].filter(
    (name): name is string => !!name
  );
  const sources = dataSourcesInfo as Record<string, { apis?: Record<string, unknown> } | undefined>;

  for (const name of knownDataSourceNames) {
    if (name in sources) {
      return name;
    }
  }

  const farmsWithExpectedOps = Object.entries(sources).find(([name, source]) => {
    if (!name.toLowerCase().includes('farms')) {
      return false;
    }

    const apis = source?.apis;
    return !!apis && (
      'GetRoot' in apis ||
      'GetAllCodetables' in apis ||
      GET_ENROLMENT_PARTNERS in apis
    );
  });

  if (farmsWithExpectedOps) {
    return farmsWithExpectedOps[0];
  }

  const farmsByName = Object.keys(sources).find((name) => name.toLowerCase().includes('farms'));
  if (farmsByName) {
    return farmsByName;
  }

  return FARMS_API_DATA_SOURCE_LEGACY;
}

const FARMS_API_DATA_SOURCE_NAME = resolveFarmsDataSourceName();

function ensureFarmsApiMetadata() {
  const sources = dataSourcesInfo as Record<string, { apis?: Record<string, unknown> } | undefined>;

  // Bridge legacy and current FARMS datasource keys explicitly.
  // These two names are different identities, not just formatting variants.
  if (!(FARMS_API_DATA_SOURCE_PRIMARY in sources) && (FARMS_API_DATA_SOURCE_LEGACY in sources) && sources[FARMS_API_DATA_SOURCE_LEGACY]) {
    sources[FARMS_API_DATA_SOURCE_PRIMARY] = {
      ...sources[FARMS_API_DATA_SOURCE_LEGACY],
      apis: {
        ...(sources[FARMS_API_DATA_SOURCE_LEGACY]?.apis ?? {}),
      },
    };
  }

  if (!(FARMS_API_DATA_SOURCE_LEGACY in sources) && (FARMS_API_DATA_SOURCE_PRIMARY in sources) && sources[FARMS_API_DATA_SOURCE_PRIMARY]) {
    sources[FARMS_API_DATA_SOURCE_LEGACY] = {
      ...sources[FARMS_API_DATA_SOURCE_PRIMARY],
      apis: {
        ...(sources[FARMS_API_DATA_SOURCE_PRIMARY]?.apis ?? {}),
      },
    };
  }

  for (const existingName of Object.keys(sources)) {
    if (!existingName.toLowerCase().includes('farms')) {
      continue;
    }

    for (const variant of getFarmsNameVariants(existingName)) {
      if (!(variant in sources) && sources[existingName]) {
        sources[variant] = {
          ...sources[existingName],
          apis: {
            ...(sources[existingName]?.apis ?? {}),
          },
        };
      }
    }
  }

  if (!(FARMS_API_DATA_SOURCE_NAME in sources)) {
    const donorName = [
      FARMS_API_DATA_SOURCE_PRIMARY,
      FARMS_API_DATA_SOURCE_LEGACY,
      ...Object.keys(sources).filter((name) => name.toLowerCase().includes('farms')),
    ].find((name) => !!sources[name]);

    if (donorName && sources[donorName]) {
      sources[FARMS_API_DATA_SOURCE_NAME] = {
        ...sources[donorName],
        apis: {
          ...(sources[donorName]?.apis ?? {}),
        },
      };
    }
  }

  const farmsDataSource = sources[FARMS_API_DATA_SOURCE_NAME];
  if (!farmsDataSource) return;

  farmsDataSource.apis ??= {};
  farmsDataSource.apis[GET_ENROLMENT_NOTICE_WORKFLOW_CALCULATION] ??= {
    path: '/{connectionId}/calculations/enrolment-notice-workflow',
    method: 'GET',
    parameters: [
      { name: 'connectionId', in: 'path', required: true, type: 'string' },
      { name: 'participantPin', in: 'query', required: true, type: 'string' },
      { name: 'programYear', in: 'query', required: true, type: 'integer' },
    ],
    responseInfo: {
      default: {
        type: 'object',
      },
    },
  };
  farmsDataSource.apis[GET_ENROLMENT_PARTNERS] ??= {
    path: '/{connectionId}/calculations/enrolment-partners',
    method: 'GET',
    parameters: [
      { name: 'connectionId', in: 'path', required: true, type: 'string' },
      { name: 'participantPin', in: 'query', required: true, type: 'string' },
      { name: 'programYear', in: 'query', required: true, type: 'integer' },
    ],
    responseInfo: {
      default: {
        type: 'object',
      },
    },
  };
}

ensureFarmsApiMetadata();

const farmsApiClient = getClient(dataSourcesInfo);

function isRetryableFarmsBindingError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes('connection reference not found') ||
    message.includes('data source not found') ||
    message.includes('unable to find data source')
  );
}

function getFarmsDataSourceCandidates(): string[] {
  const sources = dataSourcesInfo as Record<string, unknown>;
  const baseCandidates = [
    FARMS_API_DATA_SOURCE_NAME,
    FARMS_API_DATA_SOURCE_PRIMARY,
    FARMS_API_DATA_SOURCE_LEGACY,
    ...Object.keys(sources).filter((name) => name.toLowerCase().includes('farms')),
  ];

  const candidateSet = new Set<string>([
    ...baseCandidates.flatMap((name) => getFarmsNameVariants(name)),
  ]);

  return Array.from(candidateSet).filter((name) => !!name);
}

async function executeFarmsOperationWithFallback<T>(
  operationName: string,
  parameters: Record<string, unknown>
): Promise<IOperationResult<T>> {
  const candidates = getFarmsDataSourceCandidates();
  const attempts: string[] = [];
  let lastError: unknown;

  farmsDebugLog(`Start operation '${operationName}'`, {
    initialSource: FARMS_API_DATA_SOURCE_NAME,
    candidates,
    parameters,
  });

  for (const dataSourceName of candidates) {
    try {
      const result = await farmsApiClient.executeAsync<Record<string, unknown>, T>({
        connectorOperation: {
          tableName: dataSourceName,
          operationName,
          parameters,
        },
      });

      if (!result.success && isRetryableFarmsBindingError(result.error)) {
        attempts.push(`${dataSourceName}: ${getErrorMessage(result.error)}`);
        farmsDebugLog(`Retryable failure for '${operationName}' on '${dataSourceName}'`, result.error);
        lastError = result.error;
        continue;
      }

      if (!result.success) {
        farmsDebugLog(`Non-retryable failure for '${operationName}' on '${dataSourceName}'`, result.error);
      } else {
        farmsDebugLog(`Success for '${operationName}' on '${dataSourceName}'`);
      }

      return result;
    } catch (error) {
      if (isRetryableFarmsBindingError(error)) {
        attempts.push(`${dataSourceName}: ${getErrorMessage(error)}`);
        farmsDebugLog(`Retryable exception for '${operationName}' on '${dataSourceName}'`, error);
        lastError = error;
        continue;
      }

      farmsDebugLog(`Non-retryable exception for '${operationName}' on '${dataSourceName}'`, error);

      throw error;
    }
  }

  if (lastError) {
    const summary = `FARMS datasource fallback failed for ${operationName}. Tried: ${attempts.join(' | ')}`;
    farmsDebugLog(summary);
    throw new Error(`${summary}. Last error: ${getErrorMessage(lastError)}`);
  }

  throw new Error('No FARMS datasource candidates available.');
}

export const farmsApi = {
  getRoot: <T = unknown>() => (
    executeFarmsOperationWithFallback<T>('GetRoot', {})
  ),

  checkHealth: <T = unknown>(callstack = 'enrollment-app') => (
    executeFarmsOperationWithFallback<T>('GetCheckhealth', { callstack })
  ),

  getAllCodeTables: <T = unknown>(effectiveAsOfDate?: string, codeTableName?: string) => (
    executeFarmsOperationWithFallback<T>('GetAllCodetables', { effectiveAsOfDate, codeTableName })
  ),

  getOneCodeTable: <T = unknown>(codeTableName: string) => (
    executeFarmsOperationWithFallback<T>('GetOneCodetable', { codeTableName })
  ),

  getOneCode: <T = unknown>(codeTableName: string, codeName: string) => (
    executeFarmsOperationWithFallback<T>('GetOneCode', { codeTableName, codeName })
  ),

  getBenchmarkPerUnitsByProgramYear: <T = unknown>(programYear?: number) => (
    executeFarmsOperationWithFallback<T>('GetBenchmarkPerUnitsByProgramYear', { programYear })
  ),

  getFairMarketValuesByProgramYear: <T = unknown>(programYear?: number) => (
    executeFarmsOperationWithFallback<T>('GetFairMarketValuesByProgramYear', { programYear })
  ),

  getLineItemsByProgramYear: <T = unknown>(programYear?: number) => (
    executeFarmsOperationWithFallback<T>('GetLineItemsByProgramYear', { programYear })
  ),

  getEnrolmentNoticeWorkflowCalculation: <T = unknown>(participantPin: string, programYear: number) => (
    executeFarmsOperationWithFallback<T>(GET_ENROLMENT_NOTICE_WORKFLOW_CALCULATION, {
      participantPin,
      programYear,
    })
  ),

  getEnrolmentPartners: <T = unknown>(participantPin: string, programYear: number) => (
    executeFarmsOperationWithFallback<T>(GET_ENROLMENT_PARTNERS, {
      participantPin,
      programYear,
    })
  ),
};

export type { FarmsApiResult };
