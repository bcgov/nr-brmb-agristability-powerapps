type Props = {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  onPageChange: (nextPage: number) => void;
};

export function PaginationControls({ currentPage, totalPages, totalRecords, onPageChange }: Props) {
  return (
    <div className="pagination-bar">
      <button type="button" onClick={() => onPageChange(1)} disabled={currentPage <= 1}>
        {"<<"}
      </button>
      <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>
        {"< Prev"}
      </button>

      <span className="pagination-meta">
        Page {currentPage} of {totalPages} ({totalRecords} records)
      </span>

      <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
        {"Next >"}
      </button>
      <button type="button" onClick={() => onPageChange(totalPages)} disabled={currentPage >= totalPages}>
        {">>"}
      </button>
    </div>
  );
}

