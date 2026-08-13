import { useRef } from 'react';
import type { DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import type { FilterOperator, SortDir, SortKey } from '../types/enrollment';
import { ALL_COLUMNS } from '../constants/columns';
import { ColumnHeaderMenu, type ColumnHeaderFilterProps } from './ColumnHeaderMenu';
import { renderCell } from './renderCell';
import { formatEnrolmentStatusDisplay } from '../utils/helpers';

type Props = {
  allRowsCount: number;
  pagedRows: Vsi_participantprogramyears[];
  visibleColumnKeys: SortKey[];
  allPageSelected: boolean;
  somePageSelected: boolean;
  onToggleSelectAll: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onRangeSelect: (ids: string[], checked: boolean) => void;
  colDragIdx: number | null;
  onColDragStart: (index: number) => void;
  onColDragOver: (event: DragEvent, index: number) => void;
  onColDragEnd: () => void;
  taskStatusOptions: string[];
  taskStatusFilter: Set<string>;
  taskFilterOp: FilterOperator;
  onTaskStatusFilterChange: (value: Set<string>) => void;
  onTaskFilterOperatorChange: (value: FilterOperator) => void;
  enrolStatusOptions: string[];
  enrolStatusFilter: Set<string>;
  enrolFilterOp: FilterOperator;
  onEnrolStatusFilterChange: (value: Set<string>) => void;
  onEnrolFilterOperatorChange: (value: FilterOperator) => void;
  yearOptions: string[];
  yearFilter: Set<string>;
  onYearFilterChange: (value: Set<string>) => void;
  ownerOptions: string[];
  ownerFilter: Set<string>;
  onOwnerFilterChange: (value: Set<string>) => void;
  ownerFilterShortcuts?: Array<{ label: string; values: Set<string> }>;
  numberColumnFilters: Partial<Record<SortKey, { operator: 'equals' | 'notEquals' | 'hasValue' | 'hasNoValue' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual'; value: string }>>;
  onNumberColumnFilterChange: (key: SortKey, next: { operator: 'equals' | 'notEquals' | 'hasValue' | 'hasNoValue' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual'; value: string } | null) => void;
  booleanColumnFilters: Partial<Record<SortKey, { values: Set<string>; operator: FilterOperator }>>;
  onBooleanColumnFilterChange: (key: SortKey, next: Set<string>) => void;
  onBooleanColumnFilterOperatorChange: (key: SortKey, op: FilterOperator) => void;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey, dir: SortDir) => void;
  columnWidths: Partial<Record<SortKey, number>>;
  onColumnWidthChange: (key: SortKey) => (width: number | undefined) => void;
  avatarUrls: Record<string, string>;
  coreAppId: string | null;
  coreBaseUrl: string | null;
};

export function EnrolmentDataTable({
  allRowsCount,
  pagedRows,
  visibleColumnKeys,
  allPageSelected,
  somePageSelected,
  onToggleSelectAll,
  selectedIds,
  onToggleSelect,
  onRangeSelect,
  colDragIdx,
  onColDragStart,
  onColDragOver,
  onColDragEnd,
  taskStatusOptions,
  taskStatusFilter,
  taskFilterOp,
  onTaskStatusFilterChange,
  onTaskFilterOperatorChange,
  enrolStatusOptions,
  enrolStatusFilter,
  enrolFilterOp,
  onEnrolStatusFilterChange,
  onEnrolFilterOperatorChange,
  yearOptions,
  yearFilter,
  onYearFilterChange,
  ownerOptions,
  ownerFilter,
  onOwnerFilterChange,
  ownerFilterShortcuts,
  numberColumnFilters,
  onNumberColumnFilterChange,
  booleanColumnFilters,
  onBooleanColumnFilterChange,
  onBooleanColumnFilterOperatorChange,
  sortKey,
  sortDir,
  onSort,
  columnWidths,
  onColumnWidthChange,
  avatarUrls,
  coreAppId,
  coreBaseUrl,
}: Props) {
  const lastClickedIdxRef = useRef<number>(-1);
  const isEmptyState = allRowsCount === 0 || pagedRows.length === 0;
  const numberFilterableKeys = new Set<SortKey>([
    'fee',
    'totalFeesOwedCalculated',
    'totalFeesPaid',
    'enrolmentFee',
    'latePay',
    'nonPenaltyDeadlineDaysLeft',
    'finalDeadlineDaysDiff',
    'lateFinalDeadlineDaysDiff',
  ]);
  const booleanFilterableKeys = new Set<SortKey>([
    'flagged',
    'hasPartners',
    'inCombinedFarm',
    'isNewParticipant',
    'lateParticipant',
    'bringForward',
    'broughtForward',
    'manualReview',
  ]);

  return (
    <div className={`enrolment-table-container${isEmptyState ? ' is-empty' : ''}`}>
      <table className="enrolment-table">
        <thead>
          <tr>
            <th style={{ width: '2rem' }}>
              <input
                type="checkbox"
                checked={allPageSelected}
                ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                onChange={onToggleSelectAll}
              />
            </th>
            {visibleColumnKeys.map((k, colIdx) => {
              const def = ALL_COLUMNS.find(c => c.key === k)!;
              const extra: ColumnHeaderFilterProps = {};

              if (k === 'taskStatus') {
                extra.filterOptions = taskStatusOptions;
                extra.selectedFilters = taskStatusFilter;
                extra.filterOperator = taskFilterOp;
                extra.onFilterChange = onTaskStatusFilterChange;
                extra.onFilterOperatorChange = onTaskFilterOperatorChange;
              }

              if (k === 'enrolStatus') {
                extra.filterOptions = enrolStatusOptions;
                extra.filterOptionLabels = Object.fromEntries(enrolStatusOptions.map(o => [o, formatEnrolmentStatusDisplay(o)]));
                extra.selectedFilters = enrolStatusFilter;
                extra.filterOperator = enrolFilterOp;
                extra.onFilterChange = onEnrolStatusFilterChange;
                extra.onFilterOperatorChange = onEnrolFilterOperatorChange;
              }

              if (k === 'year') {
                extra.filterOptions = yearOptions;
                extra.selectedFilters = yearFilter;
                extra.onFilterChange = onYearFilterChange;
              }

              if (k === 'owner') {
                extra.filterOptions = ownerOptions;
                extra.selectedFilters = ownerFilter;
                extra.onFilterChange = onOwnerFilterChange;
                extra.filterShortcuts = ownerFilterShortcuts;
              }

              if (booleanFilterableKeys.has(k)) {
                extra.filterOptions = ['Yes', 'No'];
                extra.selectedFilters = booleanColumnFilters[k]?.values ?? new Set<string>();
                extra.filterOperator = booleanColumnFilters[k]?.operator ?? 'equals';
                extra.onFilterChange = (next) => onBooleanColumnFilterChange(k, next);
                extra.onFilterOperatorChange = (op) => onBooleanColumnFilterOperatorChange(k, op);
              }

              const dragProps = {
                draggable: true,
                onDragStart: () => onColDragStart(colIdx),
                onDragOver: (event: DragEvent) => onColDragOver(event, colIdx),
                onDragEnd: onColDragEnd,
                className: colDragIdx === colIdx ? 'col-dragging' : undefined,
              };

              if (k === 'sharepoint') {
                return <th key={k} {...dragProps} style={{ cursor: 'grab' }}>{def.label}</th>;
              }

              return (
                <ColumnHeaderMenu
                  key={k}
                  label={def?.label || 'N/A'}
                  sortLabelMode={def.icon === 'number' ? 'number' : def.icon === 'date' ? 'date' : 'text'}
                  sortKey={k}
                  currentSortKey={sortKey}
                  currentSortDir={sortDir}
                  onSort={onSort}
                  columnWidth={columnWidths[k]}
                  thStyle={k === 'year' ? { textAlign: 'center' } : k === 'fee' ? { textAlign: 'center' } : undefined}
                  onColumnWidthChange={onColumnWidthChange(k)}
                  numberFilterOperator={numberColumnFilters[k]?.operator}
                  numberFilterValue={numberColumnFilters[k]?.value ?? ''}
                  onNumberFilterApply={numberFilterableKeys.has(k)
                    ? (next) => onNumberColumnFilterChange(k, next)
                    : undefined}
                  onNumberFilterClear={numberFilterableKeys.has(k)
                    ? () => onNumberColumnFilterChange(k, null)
                    : undefined}
                  dragProps={dragProps}
                  {...extra}
                />
              );
            })}
            {!visibleColumnKeys.includes('fee') && <th className="dt-th-actions"></th>}
          </tr>
        </thead>
        <tbody>
          {allRowsCount === 0 ? (
            <tr><td colSpan={visibleColumnKeys.length + 1} className="enrolment-empty">No records found</td></tr>
          ) : pagedRows.length === 0 ? (
            <tr><td colSpan={visibleColumnKeys.length + 1} className="enrolment-empty">No rows returned</td></tr>
          ) : (
            pagedRows.map((row, index) => {
              const raw = row as unknown as Record<string, unknown>;
              return (
                <tr key={row.vsi_participantprogramyearid ?? index}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.vsi_participantprogramyearid)}
                      onChange={() => {}}
                      onClick={(e: React.MouseEvent<HTMLInputElement>) => {
                        if (e.shiftKey && lastClickedIdxRef.current >= 0) {
                          const start = Math.min(lastClickedIdxRef.current, index);
                          const end = Math.max(lastClickedIdxRef.current, index);
                          const rangeIds = pagedRows
                            .slice(start, end + 1)
                            .map(r => r.vsi_participantprogramyearid);
                          const willBeChecked = !selectedIds.has(row.vsi_participantprogramyearid);
                          onRangeSelect(rangeIds, willBeChecked);
                        } else {
                          onToggleSelect(row.vsi_participantprogramyearid);
                        }
                        lastClickedIdxRef.current = index;
                      }}
                    />
                  </td>
                  {visibleColumnKeys.map(key => {
                    // Always pass _source: 'dashboard' for navigation context
                    const rowWithSource = { ...row, _source: 'dashboard' };
                    return renderCell(key, rowWithSource, raw, avatarUrls, coreAppId, coreBaseUrl);
                  })}
                  {!visibleColumnKeys.includes('fee') && (
                    <td className="dt-td-actions">
                      <div className="dt-row-actions">
                        {row.vsi_participantprogramyearid
                          ? (
                            <Link
                              to={`/calculation/dashboard/${row.vsi_participantprogramyearid}`}
                              aria-label="Go to calculation"
                              data-tooltip="Go to calculation"
                              className="sa-calc-link"
                            >
                              <Calculator size={20} />
                            </Link>
                          )
                          : (
                            <span className="sa-calc-link sa-calc-link-disabled" aria-label="Go to calculation">
                              <Calculator size={20} className="sa-action-icon-disabled" />
                            </span>
                          )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
