import type { SortKey, PersonalView, ViewPayload, QuickFilterState } from '../types/enrollment';
import type { Userqueries } from '../generated/models/UserqueriesModel';
import type { Savedqueries } from '../generated/models/SavedqueriesModel';
import { SORTKEY_TO_FIELD, FIELD_TO_SORTKEY, DEFAULT_VIEW_SNAPSHOT, ACTIVE_VIEW_KEY } from '../constants/columns';

export function generateLayoutXml(keys: SortKey[], widths: Partial<Record<SortKey, number>>): string {
  const cells = keys
    .map(k => {
      const field = SORTKEY_TO_FIELD[k];
      const w = widths[k] ?? 125;
      return `<cell name="${field}" width="${w}" />`;
    })
    .join('');
  return `<grid name="resultset" jump="vsi_name" select="1" icon="1" preview="1"><row name="result" id="vsi_participantprogramyearid">${cells}</row></grid>`;
}

export function parseLayoutXml(xml: string | undefined | null): SortKey[] | null {
  if (!xml) return null;
  try {
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

export function userqueryToView(uq: Userqueries): PersonalView {
  try {
    const payload: ViewPayload = JSON.parse(uq.layoutjson ?? '{}');
    if (payload.visibleColumnKeys) {
      return { id: uq.userqueryid, name: uq.name, source: 'personal', ...payload };
    }
  } catch { /* layoutjson not in our format */ }
  const xmlCols = parseLayoutXml(uq.layoutxml);
  const snapshot: ViewPayload = xmlCols
    ? { ...DEFAULT_VIEW_SNAPSHOT, visibleColumnKeys: xmlCols }
    : { ...DEFAULT_VIEW_SNAPSHOT };
  return { id: uq.userqueryid, name: uq.name, source: 'personal', ...snapshot };
}

export function savedqueryToView(sq: Savedqueries): PersonalView {
  // System views only carry filter criteria — column layout is left at defaults
  // so that user-visible identity columns (participant, year, etc.) are never lost.
  const fetchFilters = parseFetchXmlToFilters(sq.fetchxml);
  const snapshot: ViewPayload = {
    ...DEFAULT_VIEW_SNAPSHOT,
    filters: { ...DEFAULT_VIEW_SNAPSHOT.filters, ...fetchFilters },
  };
  return { id: sq.savedqueryid, name: sq.name, source: 'system', ...snapshot };
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
    const hasNe = (attr: string, val: string) =>
      conditions.some(c => c.attr === attr && (c.op === 'ne' || c.op === 'neq') && c.val === val);

    const result: Partial<QuickFilterState> = {};

    // Partnerships/Combined: any condition on vsi_haspartners or vsi_incombinedfarm
    if (hasAttr('vsi_haspartners') || hasAttr('vsi_incombinedfarm')) {
      result.partnerships = true;
    }

    // EN fee calculated
    const feeCalcPresent = hasEq('vsi_enrolmentfeecalculated', '1') || hasEq('vsi_enrolmentfeecalculated', 'true');
    if (feeCalcPresent) {
      // Verified = fee calculated AND task status = Ready (865520002)
      if (hasEq('vsi_taskstatus', '865520002')) {
        result.verifiedCalc = true;
      } else if (!hasAttr('vsi_taskstatus') || hasNe('vsi_taskstatus', '865520002')) {
        // Unverified = fee calculated AND task status NOT ready
        result.unverifiedCalc = true;
      }
    }

    // 45-day letter: enrolment status = ToBeReviewed (865520009)
    if (hasEq('vsi_enrolmentstatus', '865520009')) {
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
