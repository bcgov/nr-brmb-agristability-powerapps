import type { SortKey, PersonalView, ViewPayload, QuickFilterState, AdvFilterNode, AdvFilterField, AdvFilterOp, FilterOperator } from '../types/enrollment';
import type { Userqueries } from '../generated/models/UserqueriesModel';
import type { Savedqueries } from '../generated/models/SavedqueriesModel';
import { SORTKEY_TO_FIELD, FIELD_TO_SORTKEY, DEFAULT_VIEW_SNAPSHOT, ACTIVE_VIEW_KEY } from '../constants/columns';
import { nextFilterId, serializeFilterNodes, deserializeFilterNodes } from './filterTree';
import { Vsi_participantprogramyearsvsi_taskstatus, Vsi_participantprogramyearsvsi_enrolmentstatus, Vsi_participantprogramyearsvsi_enrollmentregionaloffice, Vsi_participantprogramyearsvsi_farmingsector } from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';

// Entity object type code for `vsi_participantprogramyear`.
// Populated once on mount via resolveEntityObjectTypeCode().
// Falls back to extracting from system view layoutxml (cached below).
let entityObjectTypeCode: string | null = null;

/** Called once on mount with the ObjectTypeCode from entity metadata. */
export function setEntityObjectTypeCode(code: number | string): void {
  entityObjectTypeCode = String(code);
}

/** Returns the currently resolved entity ObjectTypeCode, or null if not yet known. */
export function getEntityObjectTypeCode(): string | null {
  return entityObjectTypeCode;
}

type WinWithXrmWebApi = {
  Xrm?: {
    WebApi?: {
      retrieveMultipleRecords: (
        entityType: string,
        options?: string,
        maxPageSize?: number
      ) => Promise<{ entities: Array<Record<string, unknown>> }>;
    };
  };
};

/**
 * Resolves the ObjectTypeCode for vsi_participantprogramyear using Xrm.WebApi,
 * which is available in model-driven app PCF contexts and handles auth internally.
 * Falls back to cachedGridOpenTag (populated from system view layoutxml).
 */
export async function resolveEntityObjectTypeCode(): Promise<void> {
  if (entityObjectTypeCode) return; // already resolved
  const candidates = [window, window.parent, window.top];
  for (const candidate of candidates) {
    try {
      if (!candidate) continue;
      const webApi = (candidate as unknown as WinWithXrmWebApi).Xrm?.WebApi;
      if (!webApi?.retrieveMultipleRecords) continue;
      const result = await webApi.retrieveMultipleRecords(
        'savedquery',
        `?$select=returnedtypecode&$top=1&$filter=returnedtypecode eq ${JSON.stringify('vsi_participantprogramyear')}`,
        1
      );
      const record = result?.entities?.[0];
      if (record) {
        // returnedtypecode from raw Xrm.WebApi OData is the integer type code
        const raw = record['returnedtypecode'];
        const num = Number(raw);
        if (!isNaN(num) && num > 0) {
          entityObjectTypeCode = String(num);
          return;
        }
      }
    } catch (e) {
      console.warn('[viewSerializer] Xrm.WebApi resolveEntityObjectTypeCode error:', e);
    }
  }

  // Fallback: use the SDK getMetadata to retrieve the ObjectTypeCode directly.
  try {
    const meta = await Vsi_participantprogramyearsService.getMetadata({});
    const raw = (meta.data as unknown as Record<string, unknown>);
    const code = raw?.['ObjectTypeCode'] ?? raw?.['objecttypecode'] ?? raw?.['objectTypeCode'];
    const num = Number(code);
    if (!isNaN(num) && num > 0) {
      entityObjectTypeCode = String(num);
      return;
    }
  } catch (e) {
    console.warn('[viewSerializer] getMetadata failed:', e);
  }

  if (!cachedGridOpenTag) {
    console.warn('[viewSerializer] Could not resolve entity ObjectTypeCode — layoutxml will be rejected by Dataverse');
  }
}

// Fallback: cache the full <grid ...> opening tag from the first system view
// we parse that contains an `object` attribute.
let cachedGridOpenTag: string | null = null;

// These keys are UI-only or not valid view columns in the model-driven app.
// They must be excluded from layoutxml and fetchxml to avoid blank/invalid columns.
// Note: 'pin' maps to vsi_name (the jump/link field) and must remain INCLUDED
// so Dataverse renders it as the named "Enrolment Name" link column rather than
// a floating navigation icon.
const LAYOUT_XML_EXCLUDED_KEYS = new Set<SortKey>(['flagged']);

function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Generates a Dataverse fetchxml for a personal view.
 * Explicitly lists all visible columns as <attribute> elements — required by
 * model-driven app views to populate data in the grid.
 * Quick filter state (taskStatusFilter, enrolStatusFilter, yearFilter, ownerFilter)
 * is encoded into fetchxml so filters survive even if layoutjson is unavailable.
 */
export function generateFetchXml(
  keys: SortKey[],
  advFilterNodes: unknown[] = [],
  quickFilters?: {
    taskStatusFilter?: string[];
    enrolStatusFilter?: string[];
    yearFilter?: string[];
    ownerFilter?: string[];
    taskFilterOp?: FilterOperator;
    enrolFilterOp?: FilterOperator;
  }
): string {
  const includedKeys = keys.filter(k => !LAYOUT_XML_EXCLUDED_KEYS.has(k));
  const fields = new Set<string>();
  for (const k of includedKeys) {
    fields.add(SORTKEY_TO_FIELD[k]);
  }
  const attrs = Array.from(fields)
    .map(f => `<attribute name="${f}"/>`)
    .join('');

  const filterParts: string[] = [];

  // Advanced filter nodes
  if (advFilterNodes.length > 0) {
    const nodes = deserializeFilterNodes(advFilterNodes);
    const parts = nodes.map(advNodeToFilterXml).filter(Boolean);
    filterParts.push(...parts);
  }

  // Quick filter: taskStatusFilter
  const taskStatusValues = quickFilters?.taskStatusFilter ?? [];
  if (taskStatusValues.length > 0) {
    const op = quickFilters?.taskFilterOp === 'notEquals' ? 'ne' : 'eq';
    const joinType = quickFilters?.taskFilterOp === 'notEquals' ? 'and' : 'or';
    const conds = taskStatusValues
      .map(label => labelToValue('taskStatus', label))
      .filter((v): v is string => v !== null)
      .map(v => `<condition attribute="vsi_taskstatus" operator="${op}" value="${v}"/>`);
    if (conds.length === 1) filterParts.push(conds[0]);
    else if (conds.length > 1) filterParts.push(`<filter type="${joinType}">${conds.join('')}</filter>`);
  }

  // Quick filter: enrolStatusFilter
  const enrolStatusValues = quickFilters?.enrolStatusFilter ?? [];
  if (enrolStatusValues.length > 0) {
    const op = quickFilters?.enrolFilterOp === 'notEquals' ? 'ne' : 'eq';
    const joinType = quickFilters?.enrolFilterOp === 'notEquals' ? 'and' : 'or';
    const conds = enrolStatusValues
      .map(label => labelToValue('enrolStatus', label))
      .filter((v): v is string => v !== null)
      .map(v => `<condition attribute="vsi_enrolmentstatus" operator="${op}" value="${v}"/>`);
    if (conds.length === 1) filterParts.push(conds[0]);
    else if (conds.length > 1) filterParts.push(`<filter type="${joinType}">${conds.join('')}</filter>`);
  }

  // Quick filter: yearFilter (OR-joined display-name conditions)
  const yearValues = quickFilters?.yearFilter ?? [];
  if (yearValues.length > 0) {
    const conds = yearValues.map(y => `<condition attribute="vsi_programyearidname" operator="eq" value="${escapeXmlAttr(y)}"/>`);
    if (conds.length === 1) filterParts.push(conds[0]);
    else filterParts.push(`<filter type="or">${conds.join('')}</filter>`);
  }

  // Quick filter: ownerFilter (OR-joined owner-name conditions)
  const ownerValues = quickFilters?.ownerFilter ?? [];
  if (ownerValues.length > 0) {
    const conds = ownerValues.map(o => `<condition attribute="owneridname" operator="eq" value="${escapeXmlAttr(o)}"/>`);
    if (conds.length === 1) filterParts.push(conds[0]);
    else filterParts.push(`<filter type="or">${conds.join('')}</filter>`);
  }

  let filterXml = '';
  if (filterParts.length > 0) {
    // Always wrap in <filter type="and"> — bare <condition> elements are not valid
    // as direct children of <entity> in Dataverse fetchxml.
    filterXml = `<filter type="and">${filterParts.join('')}</filter>`;
  }

  return `<fetch><entity name="vsi_participantprogramyear">${attrs}${filterXml}<order attribute="vsi_name" descending="false"/></entity></fetch>`;
}

// ── fetchxml filter helpers ──────────────────────────────────────────────────

const ADV_FIELD_TO_ATTR: Partial<Record<AdvFilterField, string>> = {
  taskStatus:              'vsi_taskstatus',
  enrolStatus:             'vsi_enrolmentstatus',
  pin:                     'vsi_name',
  fee:                     'vsi_enrolmentfee',
  totalFeesOwedCalculated: 'vsi_totalfeesowedcalculated',
  totalFeesPaid:           'vsi_totalfeespaid',
  latePay:                 'vsi_latepaymentfee',
  hasPartners:             'vsi_haspartners',
  inCombinedFarm:          'vsi_incombinedfarm',
  isNewParticipant:        'vsi_isnewparticipant',
  fullyProvinciallyFunded: 'vsi_fullyprovinciallyfunded',
  bringForward:            'vsi_bringforward',
  broughtForward:          'vsi_broughtforward',
  manualReview:            'vsi_manualreview',
  regionalOffice:          'vsi_enrollmentregionaloffice',
  farmingSector:           'vsi_farmingsector',
  modifiedOn:              'modifiedon',
  enrolmentNoticeSentDate: 'vsi_enrolmentnoticesentdate',
  enrolmentOptedOutDate:   'vsi_programyearoptoutdate',
  fileReceivedDate:        'vsi_filereceiveddate',
  feesPaidDate:            'vsi_enrolmentfeespaiddate',
  // producer omitted — lookup display name requires linked-entity join
};

function labelToValue(field: AdvFilterField, label: string): string | null {
  if (field === 'taskStatus') {
    const entry = Object.entries(Vsi_participantprogramyearsvsi_taskstatus).find(([, v]) => v === label);
    return entry?.[0] ?? null;
  }
  if (field === 'enrolStatus') {
    const entry = Object.entries(Vsi_participantprogramyearsvsi_enrolmentstatus).find(([, v]) => v === label);
    return entry?.[0] ?? null;
  }
  return null;
}

function advRowToConditions(node: AdvFilterNode & { kind: 'row' }): string {
  const attr = ADV_FIELD_TO_ATTR[node.field];
  if (!attr || !node.field) return '';

  // has-value / has-no-value operators (no value attribute needed)
  if (node.operator === 'hasValue') return `<condition attribute="${attr}" operator="not-null"/>`;
  if (node.operator === 'hasNoValue') return `<condition attribute="${attr}" operator="null"/>`;

  // Boolean fields (Yes/No)
  if (node.field === 'hasPartners' || node.field === 'inCombinedFarm' || node.field === 'isNewParticipant' || node.field === 'fullyProvinciallyFunded' || node.field === 'bringForward' || node.field === 'broughtForward' || node.field === 'manualReview') {
    if (node.values.size === 0) return '';
    const op = node.operator === 'notEquals' ? 'ne' : 'eq';
    const conds = [...node.values].map(v => `<condition attribute="${attr}" operator="${op}" value="${v === 'Yes' ? '1' : '0'}"/>`);
    if (conds.length === 1) return conds[0];
    const joinType = node.operator === 'notEquals' ? 'and' : 'or';
    return `<filter type="${joinType}">${conds.join('')}</filter>`;
  }

  // Choice fields (integer enum)
  if (node.field === 'taskStatus' || node.field === 'enrolStatus') {
    if (node.values.size === 0) return '';
    const op = node.operator === 'notEquals' ? 'ne' : 'eq';
    const conds = [...node.values]
      .map(label => labelToValue(node.field, label))
      .filter((v): v is string => v !== null)
      .map(v => `<condition attribute="${attr}" operator="${op}" value="${v}"/>`); 
    if (conds.length === 0) return '';
    if (conds.length === 1) return conds[0];
    const joinType = node.operator === 'notEquals' ? 'and' : 'or';
    return `<filter type="${joinType}">${conds.join('')}</filter>`;
  }

  // Text fields
  if (!node.textValue) return '';
  let fetchOp: string;
  let value = node.textValue;
  switch (node.operator) {
    case 'equals':     fetchOp = 'eq'; break;
    case 'notEquals':  fetchOp = 'ne'; break;
    case 'contains':   fetchOp = 'like'; value = `%${node.textValue}%`; break;
    case 'notContains':fetchOp = 'not-like'; value = `%${node.textValue}%`; break;
    case 'beginsWith': fetchOp = 'like'; value = `${node.textValue}%`; break;
    case 'endsWith':   fetchOp = 'like'; value = `%${node.textValue}`; break;
    default:           fetchOp = 'eq';
  }
  return `<condition attribute="${attr}" operator="${fetchOp}" value="${value}"/>`;
}

function advNodeToFilterXml(node: AdvFilterNode): string {
  if (node.kind === 'row') return advRowToConditions(node);
  const childXmls = node.children.map(advNodeToFilterXml).filter(Boolean);
  if (childXmls.length === 0) return '';
  if (childXmls.length === 1) return childXmls[0];
  return `<filter type="${node.logic.toLowerCase()}">${childXmls.join('')}</filter>`;
}

export function generateLayoutXml(keys: SortKey[], widths: Partial<Record<SortKey, number>>): string {
  const cells = keys
    .filter(k => !LAYOUT_XML_EXCLUDED_KEYS.has(k))
    .map(k => {
      const field = SORTKEY_TO_FIELD[k];
      const w = widths[k] ?? 125;
      return `<cell name="${field}" width="${w}" />`;
    })
    .join('');

  // Build the <grid> opening tag. Prefer the explicitly fetched object type code;
  // fall back to the tag template extracted from a system view's layoutxml.
  let gridOpen: string;
  if (entityObjectTypeCode) {
    gridOpen = `<grid name="resultset" object="${entityObjectTypeCode}" jump="vsi_name" select="1" icon="1" preview="1">`;
  } else if (cachedGridOpenTag) {
    gridOpen = cachedGridOpenTag;
  } else {
    // Last resort — no object attribute; Dataverse schema may reject this
    gridOpen = '<grid name="resultset" jump="vsi_name" select="1" icon="1" preview="1">';
    console.warn('[viewSerializer] generateLayoutXml: object type code not yet resolved — layoutxml may be rejected by Dataverse');
  }

  return `${gridOpen}<row name="result" id="vsi_participantprogramyearid">${cells}</row></grid>`;
}

export function parseLayoutXml(xml: string | undefined | null): SortKey[] | null {
  if (!xml) return null;
  try {
    // Cache the full <grid ...> opening tag from system view layoutxml so we
    // can use it as a template fallback if entity metadata isn't fetched yet.
    if (!cachedGridOpenTag) {
      const tagMatch = xml.match(/<grid[^>]+>/);
      if (tagMatch && /object="\d+"/.test(tagMatch[0])) {
        cachedGridOpenTag = tagMatch[0];
      }
    }
    const cellRegex = /<cell\s[^>]*name="([^"]+)"/g;
    const keys: SortKey[] = [];
    let match: RegExpExecArray | null;
    while ((match = cellRegex.exec(xml)) !== null) {
      const field = match[1];
      const sk = FIELD_TO_SORTKEY[field];
      if (sk) keys.push(sk);
    }
    return keys.length > 0 ? keys : null;
  } catch { return null; }
}

/**
 * Remove AdvFilterNodes whose conditions are already represented by QuickFilterState flags.
 * This prevents duplication when a system/personal view is applied: the same FetchXML
 * conditions can be parsed into both `filters.*` quick-filter flags AND `advFilterNodes`,
 * and `effectiveFilterNodes` in the dashboard also adds synthetic nodes for active quick
 * filters — so without this strip, the user sees (and applies) the same condition twice.
 */
function stripQuickFilterNodes(nodes: AdvFilterNode[], fetchFilters: Partial<QuickFilterState>): AdvFilterNode[] {
  function filterNode(node: AdvFilterNode): AdvFilterNode | null {
    if (node.kind === 'row') {
      // hasPartners / inCombinedFarm are exclusively handled by the partnerships quick filter
      if (fetchFilters.partnerships && (node.field === 'hasPartners' || node.field === 'inCombinedFarm')) {
        return null;
      }
      // Specific enrolStatus values captured by their corresponding quick filter flags
      if (node.field === 'enrolStatus' && node.operator === 'equals') {
        if (fetchFilters.verifiedCalc && node.values.has('VerifiedENCalculalted')) return null;
        if (fetchFilters.unverifiedCalc && node.values.has('UnverifiedENCalculated')) return null;
        if (fetchFilters.fortyFiveDayLetter && node.values.has('_45DayLetter')) return null;
      }
      return node;
    }
    // Group: recurse into children and discard empty groups
    const filteredChildren = node.children.map(filterNode).filter((n): n is AdvFilterNode => n !== null);
    if (filteredChildren.length === 0) return null;
    return { ...node, children: filteredChildren };
  }
  return nodes.map(filterNode).filter((n): n is AdvFilterNode => n !== null);
}

/**
 * Strip AdvFilterNode rows for fields managed by quick filter chips
 * (taskStatus, enrolStatus, year, owner).  These are encoded in fetchxml as a
 * reliable backup but must not appear as duplicate advFilterNodes when the
 * chip filter state is already populated from layoutjson or parseFetchXmlToQuickFilters.
 */
function stripChipFieldNodes(nodes: AdvFilterNode[]): AdvFilterNode[] {
  function strip(n: AdvFilterNode): AdvFilterNode | null {
    if (n.kind === 'row') {
      return (n.field === 'taskStatus' || n.field === 'enrolStatus' || n.field === 'year' || n.field === 'owner')
        ? null : n;
    }
    const children = n.children.map(strip).filter((c): c is AdvFilterNode => c !== null);
    return children.length > 0 ? { ...n, children } : null;
  }
  return nodes.map(strip).filter((n): n is AdvFilterNode => n !== null);
}

export function userqueryToView(uq: Userqueries): PersonalView {
  console.debug('[Views][userqueryToView] raw record', {
    id: uq.userqueryid,
    name: uq.name,
    returnedtypecode: uq.returnedtypecode,
    hasLayoutjson: !!uq.layoutjson,
    layoutjsonLength: uq.layoutjson?.length ?? 0,
    layoutjsonPreview: uq.layoutjson ? uq.layoutjson.slice(0, 200) : null,
    hasFetchxml: !!uq.fetchxml,
    fetchxmlPreview: uq.fetchxml ? uq.fetchxml.slice(0, 400) : null,
    hasLayoutxml: !!uq.layoutxml,
  });
  try {
    const payload: ViewPayload = JSON.parse(uq.layoutjson ?? '{}');
    if (payload.visibleColumnKeys) {
      console.debug('[Views][userqueryToView] PATH=layoutjson', uq.name, {
        visibleColumnKeys: payload.visibleColumnKeys,
        taskStatusFilter: payload.taskStatusFilter,
        enrolStatusFilter: payload.enrolStatusFilter,
        yearFilter: payload.yearFilter,
        ownerFilter: payload.ownerFilter,
        advFilterNodes: payload.advFilterNodes,
        filters: payload.filters,
      });
      const mergedFilters = { ...DEFAULT_VIEW_SNAPSHOT.filters, ...payload.filters };
      // Fall back to parsing fetchxml for advFilterNodes if layoutjson didn't
      // persist them (e.g. Dataverse may not return layoutjson immediately after create).
      // Strip chip-filter conditions first — fetchxml now encodes chip filters too,
      // and they must not appear as duplicate advFilterNodes alongside taskStatusFilter etc.
      const rawAdvNodes = Array.isArray(payload.advFilterNodes) && payload.advFilterNodes.length > 0
        ? (deserializeFilterNodes(payload.advFilterNodes) as AdvFilterNode[])
        : stripChipFieldNodes(parseFetchXmlToAdvNodes(uq.fetchxml));
      const advFilterNodes = serializeFilterNodes(stripQuickFilterNodes(rawAdvNodes, mergedFilters));
      const result = {
        id: uq.userqueryid,
        name: uq.name,
        source: 'personal' as const,
        ownerName: uq.owneridname || undefined,
        ...payload,
        advFilterNodes,
        filters: mergedFilters,
      };
      console.debug('[Views][userqueryToView] RESULT (layoutjson path)', uq.name, {
        taskStatusFilter: result.taskStatusFilter,
        enrolStatusFilter: result.enrolStatusFilter,
        yearFilter: result.yearFilter,
        ownerFilter: result.ownerFilter,
        advFilterNodes: result.advFilterNodes,
      });
      return result;
    }
    console.debug('[Views][userqueryToView] layoutjson present but missing visibleColumnKeys — using fallback', uq.name,
      { layoutjsonKeys: Object.keys(payload) });
  } catch (e) {
    console.debug('[Views][userqueryToView] layoutjson parse error — using fallback', uq.name, e);
  }
  const xmlCols = parseLayoutXml(uq.layoutxml);
  const rawFallbackNodes = parseFetchXmlToAdvNodes(uq.fetchxml);
  const quickFilters = parseFetchXmlToQuickFilters(uq.fetchxml);
  console.debug('[Views][userqueryToView] PATH=fallback/fetchxml', uq.name, {
    xmlColsFound: xmlCols?.length ?? 0,
    rawAdvNodeCount: rawFallbackNodes.length,
    quickFilters,
  });
  // Strip chip-field nodes — they are now captured via quickFilters, so keeping
  // them in advFilterNodes would cause duplicate filtering in effectiveFilterNodes.
  const advFilterNodes = serializeFilterNodes(stripChipFieldNodes(rawFallbackNodes));
  const snapshot: ViewPayload = {
    ...(xmlCols ? { ...DEFAULT_VIEW_SNAPSHOT, visibleColumnKeys: xmlCols } : { ...DEFAULT_VIEW_SNAPSHOT }),
    advFilterNodes,
    ...quickFilters,
  };
  console.debug('[Views][userqueryToView] RESULT (fallback path)', uq.name, {
    taskStatusFilter: snapshot.taskStatusFilter,
    enrolStatusFilter: snapshot.enrolStatusFilter,
    yearFilter: snapshot.yearFilter,
    ownerFilter: snapshot.ownerFilter,
    advFilterNodes: snapshot.advFilterNodes,
  });
  return { id: uq.userqueryid, name: uq.name, source: 'personal', ownerName: uq.owneridname || undefined, ...snapshot };
}

// Columns that must always be present regardless of what the view definition says
const REQUIRED_COLUMNS: SortKey[] = ['flagged', 'pin'];

/** Merge required columns into a parsed column list without duplicating. */
function mergeRequiredColumns(keys: SortKey[]): SortKey[] {
  const required = REQUIRED_COLUMNS.filter(k => !keys.includes(k));
  return [...required, ...keys];
}

export function savedqueryToView(sq: Savedqueries): PersonalView {
  const fetchFilters = parseFetchXmlToFilters(sq.fetchxml);
  // Strip nodes already captured by quick filter flags to prevent duplication in effectiveFilterNodes
  const rawAdvNodes = parseFetchXmlToAdvNodes(sq.fetchxml);
  const advFilterNodes = serializeFilterNodes(stripQuickFilterNodes(rawAdvNodes, fetchFilters));

  // Parse column layout from layoutxml; fall back to defaults if unparseable
  const xmlCols = parseLayoutXml(sq.layoutxml);
  const visibleColumnKeys = xmlCols
    ? mergeRequiredColumns(xmlCols)
    : [...DEFAULT_VIEW_SNAPSHOT.visibleColumnKeys];

  const snapshot: ViewPayload = {
    ...DEFAULT_VIEW_SNAPSHOT,
    visibleColumnKeys,
    filters: { ...DEFAULT_VIEW_SNAPSHOT.filters, ...fetchFilters },
    advFilterNodes,
  };
  return { id: sq.savedqueryid, name: sq.name, source: 'system', ...snapshot };
}

/** Describes how to parse a Dataverse condition attribute into an AdvFilterNode row. */
type FieldSpec =
  | { field: AdvFilterField; kind: 'boolean' }
  | { field: AdvFilterField; kind: 'enum'; map: Record<string | number, string> }
  | { field: AdvFilterField; kind: 'text' }
  | { field: AdvFilterField; kind: 'choice' }; // raw string value placed directly in values Set

const CONDITION_FIELD_SPECS: Record<string, FieldSpec> = {
  vsi_haspartners:              { field: 'hasPartners',             kind: 'boolean' },
  vsi_incombinedfarm:           { field: 'inCombinedFarm',          kind: 'boolean' },
  vsi_isnewparticipant:         { field: 'isNewParticipant',        kind: 'boolean' },
  vsi_fullyprovinciallyfunded:  { field: 'fullyProvinciallyFunded', kind: 'boolean' },
  vsi_bringforward:             { field: 'bringForward',            kind: 'boolean' },
  vsi_broughtforward:           { field: 'broughtForward',          kind: 'boolean' },
  vsi_manualreview:             { field: 'manualReview',            kind: 'boolean' },
  vsi_taskstatus:               { field: 'taskStatus',              kind: 'enum', map: Vsi_participantprogramyearsvsi_taskstatus },
  vsi_enrolmentstatus:          { field: 'enrolStatus',             kind: 'enum', map: Vsi_participantprogramyearsvsi_enrolmentstatus },
  vsi_enrollmentregionaloffice: { field: 'regionalOffice',          kind: 'enum', map: Vsi_participantprogramyearsvsi_enrollmentregionaloffice },
  vsi_farmingsector:            { field: 'farmingSector',           kind: 'enum', map: Vsi_participantprogramyearsvsi_farmingsector },
  vsi_name:                     { field: 'pin',                     kind: 'text' },
  vsi_producerfullname:         { field: 'producer',                kind: 'text' },
  vsi_enrolmentfee:             { field: 'fee',                     kind: 'text' },
  // vsi_totalfeesowed is legacy — map to totalFeesOwedCalculated so MDA views
  // using this field still filter correctly without exposing it in the UI
  vsi_totalfeesowed:            { field: 'totalFeesOwedCalculated', kind: 'text' },
  vsi_totalfeesowedcalculated:  { field: 'totalFeesOwedCalculated', kind: 'text' },
  vsi_totalfeespaid:            { field: 'totalFeesPaid',           kind: 'text' },
  vsi_latepaymentfee:           { field: 'latePay',                 kind: 'text' },
  vsi_enrolmentnoticesentdate:  { field: 'enrolmentNoticeSentDate', kind: 'text' },
  vsi_programyearoptoutdate:    { field: 'enrolmentOptedOutDate',   kind: 'text' },
  vsi_filereceiveddate:         { field: 'fileReceivedDate',        kind: 'text' },
  vsi_enrolmentfeespaiddate:    { field: 'feesPaidDate',            kind: 'text' },
  modifiedon:                   { field: 'modifiedOn',              kind: 'text' },
  // Year — system views use the display-name field for year-based conditions
  vsi_programyearidname:        { field: 'year',                    kind: 'choice' },
  // Owner — system views may filter by owner display name
  owneridname:                  { field: 'owner',                   kind: 'choice' },
};

function fetchXmlOpToAdvOp(op: string, kind: FieldSpec['kind']): AdvFilterOp {
  if (op === 'ne' || op === 'neq' || op === 'not-eq') return 'notEquals';
  if (kind === 'text') {
    if (op === 'not-like') return 'notContains';
    if (op === 'like') return 'contains';
    if (op === 'begins-with') return 'beginsWith';
    if (op === 'ends-with') return 'endsWith';
  }
  return 'equals';
}

/**
 * Parse a Dataverse fetchxml `<filter>` element and convert conditions for
 * known fields into AdvFilterNode[]. Returns an empty array if no known
 * conditions are found or the xml is invalid.
 */
export function parseFetchXmlToAdvNodes(fetchxml: string | undefined | null): AdvFilterNode[] {
  if (!fetchxml) return [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(fetchxml, 'text/xml');
    if (doc.querySelector('parsererror')) return [];

    function processFilter(filterEl: Element): AdvFilterNode | null {
      const ownLogic = (filterEl.getAttribute('type') ?? 'and').toUpperCase() as 'AND' | 'OR';
      const children: AdvFilterNode[] = [];

      for (const child of Array.from(filterEl.children)) {
        if (child.tagName === 'condition') {
          const attr = child.getAttribute('attribute') ?? '';
          const op = child.getAttribute('operator') ?? 'eq';
          const rawVal = child.getAttribute('value') ?? '';
          const spec = CONDITION_FIELD_SPECS[attr];
          if (!spec) continue;

          // Handle not-null / null operators before value-based processing
          if (op === 'not-null' || op === 'null') {
            children.push({
              kind: 'row', id: nextFilterId(), field: spec.field,
              operator: op === 'not-null' ? 'hasValue' : 'hasNoValue',
              values: new Set<string>(), textValue: '',
            });
            continue;
          }

          const operator = fetchXmlOpToAdvOp(op, spec.kind);

          if (spec.kind === 'boolean') {
            const isTrue = rawVal === '1' || rawVal.toLowerCase() === 'true';
            children.push({
              kind: 'row', id: nextFilterId(), field: spec.field,
              operator, values: new Set([isTrue ? 'Yes' : 'No']), textValue: '',
            });
          } else if (spec.kind === 'enum') {
            const label = spec.map[rawVal as keyof typeof spec.map];
            if (!label) continue;
            children.push({
              kind: 'row', id: nextFilterId(), field: spec.field,
              operator, values: new Set([label]), textValue: '',
            });
          } else if (spec.kind === 'choice') {
            // Raw string value goes directly into the values Set (used for year, owner, etc.)
            if (!rawVal) continue;
            children.push({
              kind: 'row', id: nextFilterId(), field: spec.field,
              operator, values: new Set([rawVal]), textValue: '',
            });
          } else {
            // text / numeric — strip surrounding % from LIKE wildcards
            const textValue = rawVal.replace(/^%|%$/g, '');
            children.push({
              kind: 'row', id: nextFilterId(), field: spec.field,
              operator, values: new Set<string>(), textValue,
            });
          }
        } else if (child.tagName === 'filter') {
          const nested = processFilter(child);
          if (nested) children.push(nested);
        }
      }

      if (children.length === 0) return null;
      if (children.length === 1 && children[0].kind === 'row') return children[0];
      return { kind: 'group', id: nextFilterId(), logic: ownLogic, children };
    }

    const entityEl = doc.querySelector('entity');
    const filterEl = entityEl?.querySelector(':scope > filter');
    if (!filterEl) return [];

    const result = processFilter(filterEl);
    return result ? [result] : [];
  } catch {
    return [];
  }
}

/**
 * Parse a Dataverse fetchxml string and reconstruct quick filter arrays
 * (taskStatusFilter, enrolStatusFilter, yearFilter, ownerFilter) that were
 * encoded into fetchxml as a reliable fallback when layoutjson is unavailable.
 */
export function parseFetchXmlToQuickFilters(fetchxml: string | undefined | null): {
  taskStatusFilter: string[];
  enrolStatusFilter: string[];
  taskFilterOp: FilterOperator;
  enrolFilterOp: FilterOperator;
  yearFilter: string[];
  ownerFilter: string[];
} {
  const result = {
    taskStatusFilter: [] as string[],
    enrolStatusFilter: [] as string[],
    taskFilterOp: 'equals' as FilterOperator,
    enrolFilterOp: 'equals' as FilterOperator,
    yearFilter: [] as string[],
    ownerFilter: [] as string[],
  };
  if (!fetchxml) return result;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(fetchxml, 'text/xml');
    if (doc.querySelector('parsererror')) return result;

    for (const cond of Array.from(doc.querySelectorAll('condition'))) {
      const attr = cond.getAttribute('attribute') ?? '';
      const op = cond.getAttribute('operator') ?? 'eq';
      const val = cond.getAttribute('value') ?? '';

      if (attr === 'vsi_taskstatus') {
        const label = Vsi_participantprogramyearsvsi_taskstatus[val as unknown as keyof typeof Vsi_participantprogramyearsvsi_taskstatus];
        if (label && !result.taskStatusFilter.includes(label)) result.taskStatusFilter.push(label);
        if (op === 'ne' || op === 'neq') result.taskFilterOp = 'notEquals';
      } else if (attr === 'vsi_enrolmentstatus') {
        const label = Vsi_participantprogramyearsvsi_enrolmentstatus[val as unknown as keyof typeof Vsi_participantprogramyearsvsi_enrolmentstatus];
        if (label && !result.enrolStatusFilter.includes(label)) result.enrolStatusFilter.push(label);
        if (op === 'ne' || op === 'neq') result.enrolFilterOp = 'notEquals';
      } else if (attr === 'vsi_programyearidname') {
        if (val && !result.yearFilter.includes(val)) result.yearFilter.push(val);
      } else if (attr === 'owneridname') {
        if (val && !result.ownerFilter.includes(val)) result.ownerFilter.push(val);
      }
    }
    return result;
  } catch {
    return result;
  }
}

/** Parse a Dataverse fetchxml string and extract known QuickFilterState flags. */
export function parseFetchXmlToFilters(fetchxml: string | undefined | null): Partial<QuickFilterState> {
  if (!fetchxml) return {};
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(fetchxml, 'text/xml');
    const conditions = Array.from(doc.querySelectorAll('condition')).map(c => ({
      attr: c.getAttribute('attribute') ?? '',
      op: c.getAttribute('operator') ?? 'eq',
      val: (c.getAttribute('value') ?? '').toLowerCase(),
    }));

    const hasAttr = (attr: string) => conditions.some(c => c.attr === attr);
    const hasEq = (attr: string, val: string) =>
      conditions.some(c => c.attr === attr && c.op === 'eq' && c.val === val);
    const result: Partial<QuickFilterState> = {};

    // Partnerships/Combined: any condition on vsi_haspartners or vsi_incombinedfarm
    if (hasAttr('vsi_haspartners') || hasAttr('vsi_incombinedfarm')) {
      result.partnerships = true;
    }

    // Verified EN Calculated = enrolment status = VerifiedENCalculalted (865520006)
    if (hasEq('vsi_enrolmentstatus', '865520006')) {
      result.verifiedCalc = true;
    }

    // Unverified EN Calculated = enrolment status = UnverifiedENCalculated (865520005)
    if (hasEq('vsi_enrolmentstatus', '865520005')) {
      result.unverifiedCalc = true;
    }

    // 45-day letter: enrolment status = _45DayLetter (865520010)
    if (hasEq('vsi_enrolmentstatus', '865520010')) {
      result.fortyFiveDayLetter = true;
    }

    return result;
  } catch {
    return {};
  }
}

export function loadActiveViewId(): string | null {
  return localStorage.getItem(ACTIVE_VIEW_KEY);
}

export function saveActiveViewId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_VIEW_KEY, id);
  else localStorage.removeItem(ACTIVE_VIEW_KEY);
}
