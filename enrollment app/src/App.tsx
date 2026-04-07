import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { EnrollmentFiltersBar } from "./components/EnrollmentFiltersBar";
import { EnrollmentsTable } from "./components/EnrollmentsTable";
import { PaginationControls } from "./components/PaginationControls";
import { useEnrollmentData } from "./hooks/useEnrollmentData";
import type {
  EnrollmentFilterState,
  EnrollmentRecord,
  SortColumn,
  SortDirection,
} from "./types/enrollment";

const PAGE_SIZE = 20;

const DEFAULT_FILTERS: EnrollmentFilterState = {
  verifiedCalculated: false,
  unverifiedCalculated: false,
  flaggedFiles: false,
  partnershipsCombined: false,
};

const compareValues = (left: string | number | null, right: string | number | null) => {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

const getSortValue = (row: EnrollmentRecord, column: SortColumn): string | number | null => {
  switch (column) {
    case "pin":
      return row.pin;
    case "producerName":
      return row.producerName;
    case "year":
      return row.year;
    case "taskStatus":
      return row.taskStatus;
    case "enrolStatus":
      return row.enrolStatus;
    case "calculatedFee":
      return row.calculatedFee;
    case "sharepoint":
      return row.sharepointUrl;
    case "modifiedOn": {
      const parsed = Date.parse(row.modifiedOn);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    default:
      return "";
  }
};

const matchesFilters = (row: EnrollmentRecord, filters: EnrollmentFilterState) => {
  const activeFilterKeys = Object.entries(filters)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key as keyof EnrollmentFilterState);

  if (activeFilterKeys.length === 0) {
    return true;
  }

  return activeFilterKeys.some((key) => row.flags[key]);
};

function App() {
  const { rows, loading, error } = useEnrollmentData();

  const [filters, setFilters] = useState<EnrollmentFilterState>(DEFAULT_FILTERS);
  const [sortColumn, setSortColumn] = useState<SortColumn>("modifiedOn");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredRows = useMemo(() => rows.filter((row) => matchesFilters(row, filters)), [rows, filters]);

  const sortedRows = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((left, right) => {
      const leftValue = getSortValue(left, sortColumn);
      const rightValue = getSortValue(right, sortColumn);
      return compareValues(leftValue, rightValue) * direction;
    });
  }, [filteredRows, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    setCurrentPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const validIds = new Set(rows.map((row) => row.id));
    setSelectedIds((previous) => {
      let changed = false;
      const next = new Set<string>();

      previous.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [rows]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = sortedRows.slice(pageStart, pageStart + PAGE_SIZE);
  const pageRowIds = pageRows.map((row) => row.id);

  const allVisibleSelected = pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = pageRowIds.some((id) => selectedIds.has(id));

  const handleSortChange = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
      return;
    }

    setSortColumn(column);
    setSortDirection(column === "modifiedOn" ? "desc" : "asc");
  };

  const handleToggleRow = (rowId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const handleToggleAllVisible = (checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);

      if (checked) {
        pageRowIds.forEach((id) => next.add(id));
      } else {
        pageRowIds.forEach((id) => next.delete(id));
      }

      return next;
    });
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) {
      return;
    }
    setCurrentPage(nextPage);
  };

  return (
    <main className="dashboard">
      <h1>Enrolments</h1>

      <EnrollmentFiltersBar filters={filters} onChange={setFilters} />

      {loading ? <p className="state-message">Loading enrolments...</p> : null}
      {error ? <p className="state-message error">{error}</p> : null}

      {!loading && !error ? (
        <>
          <EnrollmentsTable
            rows={pageRows}
            selectedIds={selectedIds}
            allVisibleSelected={allVisibleSelected}
            someVisibleSelected={someVisibleSelected}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onToggleRow={handleToggleRow}
            onToggleAllVisible={handleToggleAllVisible}
            onSortChange={handleSortChange}
          />

          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={sortedRows.length}
            onPageChange={handlePageChange}
          />
        </>
      ) : null}
    </main>
  );
}

export default App;

