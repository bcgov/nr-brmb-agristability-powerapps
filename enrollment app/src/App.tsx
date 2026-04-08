import { useEffect, useMemo, useState } from 'react';
import './App.css';

import type { SortKey, SortDir, FilterOperator, AdvFilterNode, LogicOp } from './types/enrollment';
import { ALL_COLUMNS, DEFAULT_VISIBLE_KEYS } from './constants/columns';
import { countActiveNodes } from './utils/filterTree';
import { useEnrolmentData, useSortedAndFilteredRows } from './hooks/useEnrolmentData';
import { useViews } from './hooks/useViews';

import { ViewsMenu } from './components/ViewsMenu';
import { ColumnHeaderMenu } from './components/ColumnHeaderMenu';
import { EditColumnsPanel } from './components/EditColumnsPanel';
import { EditFiltersPanel } from './components/EditFiltersPanel';
import { BulkNoticesModal } from './components/BulkNoticesModal';
import { EnrollmentSearchBar } from './components/EnrollmentSearchBar';
import { renderCell } from './components/renderCell';

const PAGE_SIZE = 20;

function App() {
  const { rows, loading, error, avatarUrls } = useEnrolmentData();

  // Column & sort state
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<SortKey[]>([...DEFAULT_VISIBLE_KEYS]);
  const [columnWidths, setColumnWidths] = useState<Partial<Record<SortKey, number>>>({});
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Filter state
  const [filters, setFilters] = useState({ verifiedCalc: false, unverifiedCalc: false, flagged: false, partnerships: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<Set<string>>(new Set());
  const [enrolStatusFilter, setEnrolStatusFilter] = useState<Set<string>>(new Set());
  const [taskFilterOp, setTaskFilterOp] = useState<FilterOperator>('equals');
  const [enrolFilterOp, setEnrolFilterOp] = useState<FilterOperator>('equals');
  const [advFilterNodes, setAdvFilterNodes] = useState<AdvFilterNode[]>([]);
  const [advLogicOp, setAdvLogicOp] = useState<LogicOp>('AND');

  // Pagination & selection
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Panel visibility
  const [showEditColumns, setShowEditColumns] = useState(false);
  const [showEditFilters, setShowEditFilters] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Column drag-and-drop
  const [colDragIdx, setColDragIdx] = useState<number | null>(null);
  const handleColDragStart = (i: number) => setColDragIdx(i);
  const handleColDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (colDragIdx === null || colDragIdx === i) return;
    setVisibleColumnKeys(prev => {
      const next = [...prev];
      const [moved] = next.splice(colDragIdx, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setColDragIdx(i);
  };
  const handleColDragEnd = () => setColDragIdx(null);

  // Views hook
  const viewSetters = useMemo(() => ({
    setVisibleColumnKeys, setColumnWidths, setSortKey, setSortDir,
    setFilters, setTaskStatusFilter, setEnrolStatusFilter,
    setTaskFilterOp, setEnrolFilterOp, setAdvFilterNodes, setAdvLogicOp,
  }), []);

  const viewState = useMemo(() => ({
    visibleColumnKeys, columnWidths, sortKey, sortDir, filters,
    taskStatusFilter, enrolStatusFilter, taskFilterOp, enrolFilterOp,
    advFilterNodes, advLogicOp,
  }), [visibleColumnKeys, columnWidths, sortKey, sortDir, filters,
    taskStatusFilter, enrolStatusFilter, taskFilterOp, enrolFilterOp,
    advFilterNodes, advLogicOp]);

  const {
    savedViews, viewsLoading, activeViewId, hasUnsavedChanges,
    handleSelectView, handleSaveAsNew, handleSaveCurrentView,
    handleDeleteView, handleRenameView, handleResetDefault,
  } = useViews(viewState, viewSetters);

  // Sorting & filtering
  const { filteredRows, taskStatusOptions, enrolStatusOptions } = useSortedAndFilteredRows(
    rows, sortKey, sortDir, filters,
    taskStatusFilter, enrolStatusFilter, taskFilterOp, enrolFilterOp,
    advFilterNodes, advLogicOp,
  );

  const searchedRows = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return filteredRows;

    return filteredRows.filter((row) => {
      const raw = row as unknown as Record<string, unknown>;
      const pin = row.vsi_name ?? '';
      const participant = (row.vsi_participantidname ?? raw['_vsi_participantid_value@OData.Community.Display.V1.FormattedValue'] ?? '') as string;
      const farmCorp = (row.new_combinedfarmname ?? row.vsi_partnershipnames ?? '') as string;

      return [pin, participant, farmCorp].some((value) => String(value).toLowerCase().includes(term));
    });
  }, [filteredRows, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(searchedRows.length / PAGE_SIZE));
  const pagedRows = searchedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const allPageSelected = pagedRows.length > 0 && pagedRows.every(r => selectedIds.has(r.vsi_participantprogramyearid));
  const somePageSelected = pagedRows.some(r => selectedIds.has(r.vsi_participantprogramyearid));

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        pagedRows.forEach(r => next.delete(r.vsi_participantprogramyearid));
      } else {
        pagedRows.forEach(r => next.add(r.vsi_participantprogramyearid));
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleFilter = (key: keyof typeof filters) =>
    setFilters(f => ({ ...f, [key]: !f[key] }));

  const setSort = (key: SortKey, dir: SortDir) => { setSortKey(key); setSortDir(dir); };

  const setColumnWidth = (key: SortKey) => (w: number | undefined) =>
    setColumnWidths(prev => {
      const next = { ...prev };
      if (w === undefined) delete next[key]; else next[key] = w;
      return next;
    });

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [filters, taskStatusFilter, enrolStatusFilter, advFilterNodes, advLogicOp, searchQuery]);

  return (
    <div className="enrolment-wrapper">
      <ViewsMenu
        views={savedViews}
        activeViewId={activeViewId}
        hasUnsavedChanges={hasUnsavedChanges}
        onSelectView={handleSelectView}
        onSaveAsNew={handleSaveAsNew}
        onSaveCurrentView={handleSaveCurrentView}
        onResetDefault={handleResetDefault}
        onDeleteView={handleDeleteView}
        onRenameView={handleRenameView}
        viewsLoading={viewsLoading}
      />

      {loading && <p className="enrolment-loading">Loading…</p>}
      {error && <p className="enrolment-error">{error}</p>}

      {!loading && !error && (
        <>
          <EnrollmentSearchBar value={searchQuery} onChange={setSearchQuery} />

          <div className="enrolment-filters">
            <strong>Apply Filters</strong>
            <label><input type="checkbox" checked={filters.verifiedCalc} onChange={() => toggleFilter('verifiedCalc')} /> Verified, EN Calculated</label>
            <label><input type="checkbox" checked={filters.unverifiedCalc} onChange={() => toggleFilter('unverifiedCalc')} /> Unverified, EN Calculated</label>
            <label><input type="checkbox" checked={filters.flagged} onChange={() => toggleFilter('flagged')} /> Flagged files</label>
            <label><input type="checkbox" checked={filters.partnerships} onChange={() => toggleFilter('partnerships')} /> Partnerships/Combined</label>
            <button className="ef-edit-btn" onClick={() => setShowEditColumns(true)}>
              <span className="ef-edit-icon">&#x1F5C2;</span> Edit columns
            </button>
            <button className="ef-edit-btn" onClick={() => setShowEditFilters(true)}>
              <span className="ef-edit-icon">&#x25BD;</span> Edit filters
            </button>
            {advFilterNodes.length > 0 && (
              <span className="ef-active-count">{countActiveNodes(advFilterNodes)} advanced filter(s)</span>
            )}
          </div>

          <div className="enrolment-table-container">
            <table className="enrolment-table">
              <thead>
                <tr>
                  <th style={{ width: '2rem' }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  {visibleColumnKeys.map((k, colIdx) => {
                    const def = ALL_COLUMNS.find(c => c.key === k)!;
                    const extra: Record<string, unknown> = {};
                    if (k === 'taskStatus') {
                      extra.filterOptions = taskStatusOptions;
                      extra.selectedFilters = taskStatusFilter;
                      extra.filterOperator = taskFilterOp;
                      extra.onFilterChange = setTaskStatusFilter;
                      extra.onFilterOperatorChange = setTaskFilterOp;
                    }
                    if (k === 'enrolStatus') {
                      extra.filterOptions = enrolStatusOptions;
                      extra.selectedFilters = enrolStatusFilter;
                      extra.filterOperator = enrolFilterOp;
                      extra.onFilterChange = setEnrolStatusFilter;
                      extra.onFilterOperatorChange = setEnrolFilterOp;
                    }
                    const dragProps = {
                      draggable: true,
                      onDragStart: () => handleColDragStart(colIdx),
                      onDragOver: (e: React.DragEvent) => handleColDragOver(e, colIdx),
                      onDragEnd: handleColDragEnd,
                      className: colDragIdx === colIdx ? 'col-dragging' : undefined,
                    };
                    if (k === 'sharepoint') return <th key={k} {...dragProps} style={{ cursor: 'grab' }}>SharePoint</th>;
                    return (
                      <ColumnHeaderMenu
                        key={k}
                        label={def.label}
                        sortKey={k}
                        currentSortKey={sortKey}
                        currentSortDir={sortDir}
                        onSort={setSort}
                        columnWidth={columnWidths[k]}
                        onColumnWidthChange={setColumnWidth(k)}
                        dragProps={dragProps}
                        {...extra as any}
                      />
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={visibleColumnKeys.length + 1} className="enrolment-empty">No records found</td></tr>
                ) : pagedRows.length === 0 ? (
                  <tr><td colSpan={visibleColumnKeys.length + 1} className="enrolment-empty">No rows returned</td></tr>
                ) : (
                  pagedRows.map((row, i) => {
                    const raw = row as unknown as Record<string, unknown>;
                    return (
                      <tr key={row.vsi_participantprogramyearid ?? i}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.vsi_participantprogramyearid)}
                            onChange={() => toggleSelect(row.vsi_participantprogramyearid)}
                          />
                        </td>
                        {visibleColumnKeys.map(k => renderCell(k, row, raw, avatarUrls))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="enrolment-pagination">
            <button disabled={currentPage <= 1} onClick={() => setCurrentPage(1)}>&laquo;</button>
            <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>&lsaquo; Prev</button>
            <span>Page {currentPage} of {totalPages} ({searchedRows.length} records)</span>
            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next &rsaquo;</button>
            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(totalPages)}>&raquo;</button>
          </div>

          <div className="enrolment-actions">
            <button className="btn-bulk" onClick={() => setShowBulkModal(true)}>
              <span className="btn-bulk-icon">&#x1F5B6;</span> Bulk EN Notices
            </button>
          </div>
        </>
      )}

      {showEditColumns && (
        <EditColumnsPanel
          visibleKeys={visibleColumnKeys}
          onApply={(keys) => { setVisibleColumnKeys(keys); setShowEditColumns(false); }}
          onCancel={() => setShowEditColumns(false)}
        />
      )}
      {showEditFilters && (
        <EditFiltersPanel
          filterNodes={advFilterNodes}
          logicOp={advLogicOp}
          onApply={(nodes, logic) => {
            setAdvFilterNodes(nodes);
            setAdvLogicOp(logic);
            setShowEditFilters(false);
          }}
          onCancel={() => setShowEditFilters(false)}
        />
      )}
      {showBulkModal && (
        <BulkNoticesModal
          selectedIds={selectedIds}
          rows={rows}
          onClose={() => setShowBulkModal(false)}
        />
      )}
    </div>
  );
}

export default App;
