import { useEffect, useRef } from "react";
import type { EnrollmentRecord, SortColumn, SortDirection } from "../types/enrollment";
import {
  enrolStatusTone,
  formatCurrency,
  formatShortDate,
  taskStatusTone,
} from "../utils/enrollmentMapper";

type Props = {
  rows: EnrollmentRecord[];
  selectedIds: Set<string>;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onToggleRow: (rowId: string) => void;
  onToggleAllVisible: (checked: boolean) => void;
  onSortChange: (column: SortColumn) => void;
};

const COLUMNS: Array<{ id: SortColumn; label: string }> = [
  { id: "pin", label: "PIN" },
  { id: "producerName", label: "Producer name" },
  { id: "year", label: "Year" },
  { id: "taskStatus", label: "Task Status" },
  { id: "enrolStatus", label: "Enrol status" },
  { id: "calculatedFee", label: "Calculated fee" },
  { id: "sharepoint", label: "SharePoint" },
  { id: "modifiedOn", label: "Modified" },
];

export function EnrollmentsTable({
  rows,
  selectedIds,
  allVisibleSelected,
  someVisibleSelected,
  sortColumn,
  sortDirection,
  onToggleRow,
  onToggleAllVisible,
  onSortChange,
}: Props) {
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  return (
    <div className="table-card">
      <table className="enrolments-table">
        <thead>
          <tr>
            <th className="checkbox-cell">
              <input
                ref={selectAllRef}
                type="checkbox"
                className="dash-checkbox"
                checked={allVisibleSelected}
                onChange={(event) => onToggleAllVisible(event.target.checked)}
                aria-label="Select all rows"
              />
            </th>
            {COLUMNS.map((column) => {
              const isActive = sortColumn === column.id;
              return (
                <th key={column.id}>
                  <button type="button" className="header-sort" onClick={() => onSortChange(column.id)}>
                    <span>{column.label}</span>
                    <span className={`sort-icon ${isActive ? `active ${sortDirection}` : ""}`} aria-hidden="true">
                      <span className="caret up" />
                      <span className="caret down" />
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => {
            const taskTone = taskStatusTone(row.taskStatus);
            const enrolTone = enrolStatusTone(row.enrolStatus);
            const isChecked = selectedIds.has(row.id);
            const taskStatusText = row.taskStatus?.trim() ?? "";

            return (
              <tr key={row.id}>
                <td className="checkbox-cell">
                  <input
                    type="checkbox"
                    className="dash-checkbox"
                    checked={isChecked}
                    onChange={() => onToggleRow(row.id)}
                    aria-label={`Select ${row.pin}`}
                  />
                </td>

                <td>
                  <a href="#" className="pin-link" onClick={(event) => event.preventDefault()}>
                    {row.pin || "-"}
                  </a>
                </td>
                <td>{row.producerName || "-"}</td>
                <td>{row.year || "-"}</td>
                <td>
                  {taskStatusText ? (
                    <span className={`task-pill ${taskTone}`}>
                      <span className="task-dot" aria-hidden="true" />
                      {taskStatusText}
                    </span>
                  ) : null}
                </td>
                <td>
                  <span className={`status-badge ${enrolTone}`}>{row.enrolStatus || "-"}</span>
                </td>
                <td className="numeric-cell">{formatCurrency(row.calculatedFee) || "-"}</td>
                <td>
                  {row.sharepointUrl ? (
                    <a href={row.sharepointUrl} target="_blank" rel="noreferrer" className="sharepoint-link">
                      SharePoint
                    </a>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
                <td className="date-cell">{formatShortDate(row.modifiedOn) || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

