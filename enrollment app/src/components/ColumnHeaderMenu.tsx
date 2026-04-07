import { useRef, useState } from 'react';
import type { SortKey, SortDir, FilterOperator } from '../types/enrollment';

type MenuView = 'main' | 'filter' | 'width';

export function ColumnHeaderMenu({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  onSort,
  filterOptions,
  selectedFilters,
  filterOperator,
  onFilterChange,
  onFilterOperatorChange,
  columnWidth,
  onColumnWidthChange,
  dragProps,
}: {
  label: string;
  sortKey: SortKey;
  currentSortKey: SortKey | null;
  currentSortDir: SortDir;
  onSort: (key: SortKey, dir: SortDir) => void;
  filterOptions?: string[];
  selectedFilters?: Set<string>;
  filterOperator?: FilterOperator;
  onFilterChange?: (next: Set<string>) => void;
  onFilterOperatorChange?: (op: FilterOperator) => void;
  columnWidth: number | undefined;
  onColumnWidthChange: (w: number | undefined) => void;
  dragProps?: { draggable: boolean; onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDragEnd: () => void; className?: string };
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>('main');
  const [operatorOpen, setOperatorOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => { setOpen(false); setView('main'); setOperatorOpen(false); };

  const isSorted = currentSortKey === sortKey;
  const hasFilter = selectedFilters && selectedFilters.size > 0;

  const toggle = (val: string) => {
    if (!selectedFilters || !onFilterChange) return;
    const next = new Set(selectedFilters);
    if (next.has(val)) next.delete(val); else next.add(val);
    onFilterChange(next);
  };

  return (
    <th
      className={`col-hdr-menu-th${dragProps?.className ? ' ' + dragProps.className : ''}`}
      style={{ position: 'relative', cursor: 'grab', minWidth: columnWidth ? `${columnWidth}px` : undefined, width: columnWidth ? `${columnWidth}px` : undefined }}
      draggable={dragProps?.draggable}
      onDragStart={dragProps?.onDragStart}
      onDragOver={dragProps?.onDragOver}
      onDragEnd={dragProps?.onDragEnd}
    >
      <span className="col-hdr-label" onClick={() => { setOpen(o => !o); setView('main'); }}>
        {label}
        {isSorted && <span className="col-hdr-sort-indicator">{currentSortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
        {hasFilter && <span className="col-hdr-filter-indicator" title="Filtered">&#x25BC;</span>}
        <span className="col-hdr-chevron">&#x25BE;</span>
      </span>

      {open && (
        <>
          <div className="chm-backdrop" onClick={close} />
          <div className="chm-panel" ref={menuRef} onClick={e => e.stopPropagation()}>
            {view === 'main' && (
              <>
                <button className="chm-item" onClick={() => { onSort(sortKey, 'asc'); close(); }}>
                  <span className="chm-icon">↑</span> A to Z
                </button>
                <button className="chm-item" onClick={() => { onSort(sortKey, 'desc'); close(); }}>
                  <span className="chm-icon">↓</span> Z to A
                </button>
                {filterOptions && (
                  <>
                    <div className="chm-divider" />
                    <button className="chm-item" onClick={() => setView('filter')}>
                      <span className="chm-icon">&#x25BD;</span> Filter by
                    </button>
                  </>
                )}
                <div className="chm-divider" />
                <button className="chm-item" onClick={() => setView('width')}>
                  <span className="chm-icon">↔</span> Column width
                </button>
              </>
            )}

            {view === 'filter' && filterOptions && selectedFilters && onFilterChange && onFilterOperatorChange && (
              <div className="chm-filter-view">
                <div className="chm-filter-header">
                  <h4>Filter by</h4>
                  <button className="chm-close" onClick={close}>✕</button>
                </div>
                <div className="chm-operator-wrapper">
                  <button className="chm-operator-btn" onClick={() => setOperatorOpen(o => !o)}>
                    {filterOperator === 'notEquals' ? 'Does not equal' : 'Equals'}
                    <span className="chm-operator-chevron">&#x25BE;</span>
                  </button>
                  {operatorOpen && (
                    <div className="chm-operator-dropdown">
                      <button className={`chm-operator-opt${filterOperator === 'equals' ? ' active' : ''}`} onClick={() => { onFilterOperatorChange('equals'); setOperatorOpen(false); }}>Equals</button>
                      <button className={`chm-operator-opt${filterOperator === 'notEquals' ? ' active' : ''}`} onClick={() => { onFilterOperatorChange('notEquals'); setOperatorOpen(false); }}>Does not equal</button>
                    </div>
                  )}
                </div>
                <div className="chm-values">
                  {filterOptions.map(opt => (
                    <label key={opt} className="chm-value-item">
                      <input type="checkbox" checked={selectedFilters.has(opt)} onChange={() => toggle(opt)} />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
                <div className="chm-filter-actions">
                  <button className="chm-apply" onClick={close}>Apply</button>
                  <button className="chm-clear" onClick={() => { onFilterChange(new Set()); close(); }}>Clear filter</button>
                </div>
              </div>
            )}

            {view === 'width' && (
              <div className="chm-width-view">
                <div className="chm-filter-header">
                  <h4>Column width</h4>
                  <button className="chm-close" onClick={close}>✕</button>
                </div>
                <label className="chm-width-label">Preferred width</label>
                <input
                  className="chm-width-input"
                  type="number"
                  min={40}
                  max={600}
                  value={columnWidth ?? ''}
                  placeholder="Auto"
                  onChange={e => {
                    const v = e.target.value ? Number(e.target.value) : undefined;
                    onColumnWidthChange(v);
                  }}
                />
                <div className="chm-filter-actions">
                  <button className="chm-apply" onClick={close}>Apply</button>
                  <button className="chm-clear" onClick={() => { onColumnWidthChange(undefined); close(); }}>Reset</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </th>
  );
}
