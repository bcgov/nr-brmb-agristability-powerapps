export type LookupReference = {
  entityName: string;
  id: string;
  raw: string;
};

export function extractLookupReferences(input: string | null | undefined): LookupReference[] {
  if (!input) return [];

  const matches = [...input.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?)/g)];

  return matches
    .map(match => ({
      entityName: match[1].trim(),
      id: match[2].replace(/[{}]/g, '').toLowerCase(),
      raw: match[0].trim(),
    }))
    .filter(ref => !!ref.entityName && !!ref.id);
}

export function extractSystemUserGuids(input: string | null | undefined): string[] {
  return extractLookupReferences(input)
    .filter(ref => ref.entityName.toLowerCase() === 'systemuser')
    .map(ref => ref.id);
}

const inferEntityNameFromField = (fieldName: string | null | undefined): string | null => {
  const normalized = (fieldName ?? '').toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('businessunit') || normalized.includes('owningbusinessunit')) return 'businessunit';
  if (normalized.includes('systemuser') || normalized.includes('owner') || normalized.includes('userid') || normalized.includes('modifiedby') || normalized.includes('createdby')) return 'systemuser';
  if (normalized.includes('enrolmenthistory') || normalized.includes('primaryenrolmenthistory')) return 'vsi_enrolmenthistory';
  return null;
};

export function formatAuditValueForDisplay(
  value: string | null | undefined,
  lookupDisplayMap: Map<string, string> | Record<string, string>,
  fieldName?: string | null,
): string {
  if (!value || typeof value !== 'string' || !value.trim()) return '—';

  const trimmed = value.trim();
  const displayMap = lookupDisplayMap instanceof Map ? lookupDisplayMap : new Map(Object.entries(lookupDisplayMap));

  const guidMatch = trimmed.match(/^\{?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\}?$/);
  if (guidMatch) {
    const normalizedGuid = guidMatch[1].toLowerCase();
    const inferredEntity = inferEntityNameFromField(fieldName);
    const entityKey = inferredEntity ? `${inferredEntity}:${normalizedGuid}` : null;
    const displayName = entityKey ? displayMap.get(entityKey) ?? displayMap.get(normalizedGuid) : displayMap.get(normalizedGuid);
    return displayName ?? trimmed;
  }

  const lookups = extractLookupReferences(trimmed);

  if (lookups.length === 0) return trimmed;

  const replacementMap = new Map<string, string>();
  for (const lookup of lookups) {
    const entityKey = `${lookup.entityName.toLowerCase()}:${lookup.id}`;
    const displayName = displayMap.get(entityKey) ?? displayMap.get(lookup.id);
    if (displayName) replacementMap.set(entityKey, displayName);
  }

  if (replacementMap.size === 0) return trimmed;

  const formatted = trimmed.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?)/g, (full, entityName: string, guid: string) => {
    const normalizedGuid = guid.replace(/[{}]/g, '').toLowerCase();
    const entityKey = `${entityName.toLowerCase()}:${normalizedGuid}`;
    return replacementMap.get(entityKey) ?? replacementMap.get(normalizedGuid) ?? full;
  });

  return formatted.trim() || '—';
}
