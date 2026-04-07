import type { SortKey, PersonalView, ViewPayload } from '../types/enrollment';
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
  const xmlCols = parseLayoutXml((uq as any).layoutxml);
  const snapshot: ViewPayload = xmlCols
    ? { ...DEFAULT_VIEW_SNAPSHOT, visibleColumnKeys: xmlCols }
    : { ...DEFAULT_VIEW_SNAPSHOT };
  return { id: uq.userqueryid, name: uq.name, source: 'personal', ...snapshot };
}

export function savedqueryToView(sq: Savedqueries): PersonalView {
  const xmlCols = parseLayoutXml((sq as any).layoutxml);
  const snapshot: ViewPayload = xmlCols
    ? { ...DEFAULT_VIEW_SNAPSHOT, visibleColumnKeys: xmlCols }
    : { ...DEFAULT_VIEW_SNAPSHOT };
  return { id: sq.savedqueryid, name: sq.name, source: 'system', ...snapshot };
}

export function loadActiveViewId(): string | null {
  return localStorage.getItem(ACTIVE_VIEW_KEY);
}

export function saveActiveViewId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_VIEW_KEY, id);
  else localStorage.removeItem(ACTIVE_VIEW_KEY);
}
