type Props = {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  onFirstPage: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onLastPage: () => void;
};

export function EnrolmentPagination({
  currentPage,
  totalPages,
  totalRecords,
  onFirstPage,
  onPrevPage,
  onNextPage,
  onLastPage,
}: Props) {
  return (
    <div className="enrolment-pagination">
      <button disabled={currentPage <= 1} onClick={onFirstPage}>&laquo;</button>
      <button disabled={currentPage <= 1} onClick={onPrevPage}>&lsaquo; Prev</button>
      <span>Page {currentPage} of {totalPages} ({totalRecords} records)</span>
      <button disabled={currentPage >= totalPages} onClick={onNextPage}>Next &rsaquo;</button>
      <button disabled={currentPage >= totalPages} onClick={onLastPage}>&raquo;</button>
    </div>
  );
}

