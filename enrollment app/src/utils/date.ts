export function toDateInputValue(value: string | undefined): string {
  if (!value) return '';
  const directMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) return directMatch[1];

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateOnlyForDisplay(value: string | undefined | null, locale?: string): string {
  const dateValue = toDateInputValue(value ?? undefined);
  if (!dateValue) return '';

  const [yyyy, mm, dd] = dateValue.split('-').map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  if (Number.isNaN(date.getTime())) return '';

  if (locale) {
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'numeric', day: 'numeric' });
  }
  return date.toLocaleDateString();
}

export function getDaysBetweenDates(startValue: string | null | undefined, endValue: string | null | undefined): number | null {
  const startDate = toDateInputValue(startValue ?? undefined);
  const endDate = toDateInputValue(endValue ?? undefined);
  if (!startDate || !endDate) return null;

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.trunc((endUtc - startUtc) / 86400000);
}

export function getDaysUntilDate(value: string | null | undefined, now = new Date()): number | null {
  const dateValue = toDateInputValue(value ?? undefined);
  if (!dateValue) return null;

  const target = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;

  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.trunc((targetUtc - todayUtc) / 86400000);
}
