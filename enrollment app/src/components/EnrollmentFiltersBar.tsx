import type { EnrollmentFilterState } from "../types/enrollment";

type Props = {
  filters: EnrollmentFilterState;
  onChange: (nextFilters: EnrollmentFilterState) => void;
};

export function EnrollmentFiltersBar({ filters, onChange }: Props) {
  const updateFilter = (key: keyof EnrollmentFilterState, checked: boolean) => {
    onChange({
      ...filters,
      [key]: checked,
    });
  };

  return (
    <div className="filter-row">
      <span className="filter-label">Apply Filters</span>

      <label className="filter-option">
        <input
          type="checkbox"
          checked={filters.verifiedCalculated}
          onChange={(event) => updateFilter("verifiedCalculated", event.target.checked)}
        />
        <span>Verified, EN Calculated</span>
      </label>

      <label className="filter-option">
        <input
          type="checkbox"
          checked={filters.unverifiedCalculated}
          onChange={(event) => updateFilter("unverifiedCalculated", event.target.checked)}
        />
        <span>Unverified, EN Calculated</span>
      </label>

      <label className="filter-option">
        <input
          type="checkbox"
          checked={filters.flaggedFiles}
          onChange={(event) => updateFilter("flaggedFiles", event.target.checked)}
        />
        <span>Flagged files</span>
      </label>

      <label className="filter-option">
        <input
          type="checkbox"
          checked={filters.partnershipsCombined}
          onChange={(event) => updateFilter("partnershipsCombined", event.target.checked)}
        />
        <span>Partnerships/Combined</span>
      </label>
    </div>
  );
}

