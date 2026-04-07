type Props = {
  value: string;
  onChange: (nextValue: string) => void;
};

export function EnrollmentSearchBar({ value, onChange }: Props) {
  return (
    <div className="search-row">
      <div className="search-input-wrap">
        <span className="search-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" focusable="false">
            <path d="M8.5 3a5.5 5.5 0 1 0 3.48 9.75l3.64 3.65a1 1 0 1 0 1.42-1.42l-3.65-3.64A5.5 5.5 0 0 0 8.5 3Zm0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" />
          </svg>
        </span>
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="search-input"
          placeholder="Search PIN, Farm/Corp, Participant"
          aria-label="Search by PIN, Farm/Corp name, or Participant name"
        />
      </div>
    </div>
  );
}
