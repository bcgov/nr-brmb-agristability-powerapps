import type { QuickFilterState } from '../types/enrollment';

type Props = {
  filters: QuickFilterState;
  onToggleFilter: (key: keyof QuickFilterState) => void;
  onOpenEditColumns: () => void;
  onOpenEditFilters: () => void;
  activeAdvancedCount: number;
};

export function EnrolmentQuickFilters({
  filters,
  onToggleFilter,
  onOpenEditColumns,
  onOpenEditFilters,
  activeAdvancedCount,
}: Props) {
  return (
    <div className="enrolment-filters">
      <strong>Apply Filters</strong>
      <label><input type="checkbox" checked={filters.verifiedCalc} onChange={() => onToggleFilter('verifiedCalc')} /> Verified, EN Calculated</label>
      <label><input type="checkbox" checked={filters.unverifiedCalc} onChange={() => onToggleFilter('unverifiedCalc')} /> Unverified, EN Calculated</label>
      <label><input type="checkbox" checked={filters.flagged} onChange={() => onToggleFilter('flagged')} /> Flagged files</label>
      <label><input type="checkbox" checked={filters.partnerships} onChange={() => onToggleFilter('partnerships')} /> Partnerships/Combined</label>
      <label><input type="checkbox" checked={filters.fortyFiveDayLetter} onChange={() => onToggleFilter('fortyFiveDayLetter')} /> 45 day Letter</label>
      <button className="ef-edit-btn" onClick={onOpenEditColumns}>
        <span className="ef-edit-icon">&#x1F5C2;</span> Edit columns
      </button>
      <button className="ef-edit-btn" onClick={onOpenEditFilters}>
        <span className="ef-edit-icon">&#x25BD;</span> Edit filters
      </button>
      {activeAdvancedCount > 0 && (
        <span className="ef-active-count">{activeAdvancedCount} advanced filter(s)</span>
      )}
    </div>
  );
}

