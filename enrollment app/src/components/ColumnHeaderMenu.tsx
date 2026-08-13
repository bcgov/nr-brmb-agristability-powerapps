import { useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Filter, FilterX } from 'lucide-react';
import type { SortDir, FilterOperator } from '../types/enrollment';

type MenuView = 'main' | 'filter' | 'width';
type NumberFilterOperator =
  | 'equals'
  | 'notEquals'
  | 'hasValue'
  | 'hasNoValue'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual';

export type ColumnHeaderDragProps = {
  draggable: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  className?: string;
};

export type ColumnHeaderFilterProps = {
  filterOptions?: string[];
  filterOptionLabels?: Record<string, string>;
  selectedFilters?: Set<string>;
  filterOperator?: FilterOperator;
  onFilterChange?: (next: Set<string>) => void;
  onFilterOperatorChange?: (op: FilterOperator) => void;
  filterShortcuts?: Array<{ label: string; values: Set<string> }>;
  numberFilterValue?: string;
  numberFilterOperator?: NumberFilterOperator;
  onNumberFilterApply?: (next: { operator: NumberFilterOperator; value: string }) => void;
  onNumberFilterClear?: () => void;
};

export type ColumnHeaderMenuProps<K extends string = string> = {
  label: string;
  sortLabelMode?: 'text' | 'number' | 'date';
  sortKey: K;
  currentSortKey: K | null;
  currentSortDir: SortDir;
  onSort: (key: K, dir: SortDir) => void;
  columnWidth: number | undefined;
  onColumnWidthChange: (w: number | undefined) => void;
  dragProps?: ColumnHeaderDragProps;
  thStyle?: React.CSSProperties;
} & ColumnHeaderFilterProps;

export function ColumnHeaderMenu<K extends string = string>({
  label,
  sortLabelMode = 'text',
  sortKey,
  currentSortKey,
  currentSortDir,
  onSort,
  filterOptions,
  filterOptionLabels,
  selectedFilters,
  filterOperator,
  onFilterChange,
  onFilterOperatorChange,
  filterShortcuts,
  numberFilterValue,
  numberFilterOperator,
  onNumberFilterApply,
  onNumberFilterClear,
  columnWidth,
  onColumnWidthChange,
  dragProps,
  thStyle,
}: ColumnHeaderMenuProps<K>) {

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>('main');
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<Set<string>>(() => new Set(selectedFilters ?? []));
  const [draftOperator, setDraftOperator] = useState<FilterOperator>(() => filterOperator ?? 'equals');
  const [draftNumberOperator, setDraftNumberOperator] = useState<NumberFilterOperator>(() => numberFilterOperator ?? 'equals');
  const [draftNumberValue, setDraftNumberValue] = useState(() => numberFilterValue ?? '');
  const menuRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  // Position the menu using the anchor's bounding rect
  useLayoutEffect(() => {
    if (open && anchorRef.current && menuRef.current) {
      const anchorRect = anchorRef.current.getBoundingClientRect();
      const menu = menuRef.current;
      const menuHeight = menu.offsetHeight;
      const menuWidth = menu.offsetWidth;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      let top = anchorRect.bottom + 2;
      let left = anchorRect.left;
      // If not enough space below, open upwards
      if (top + menuHeight > viewportHeight && anchorRect.top - menuHeight > 0) {
        top = anchorRect.top - menuHeight - 2;
      }
      // Clamp left to viewport
      if (left + menuWidth > viewportWidth) {
        left = viewportWidth - menuWidth - 8;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMenuStyle({ position: 'fixed', top, left, zIndex: 1000, minWidth: 200 });
    }
  }, [open, view]);

  const close = () => { setOpen(false); setView('main'); setOperatorOpen(false); };
  const supportsNumberFilter = Boolean(onNumberFilterApply);
  const requiresNumberValue =
    draftNumberOperator !== 'hasValue' &&
    draftNumberOperator !== 'hasNoValue';
  const hasNumberFilter = Boolean(numberFilterOperator) && (
    numberFilterOperator === 'hasValue' ||
    numberFilterOperator === 'hasNoValue' ||
    Boolean((numberFilterValue ?? '').trim())
  );

  const isSorted = currentSortKey === sortKey;
  const hasFilter = (selectedFilters && selectedFilters.size > 0) || hasNumberFilter;
  const ascendingLabel =
    sortLabelMode === 'number'
      ? 'Smaller to larger'
      : sortLabelMode === 'date'
        ? 'Oldest to newest'
        : 'A to Z';
  const descendingLabel =
    sortLabelMode === 'number'
      ? 'Larger to smaller'
      : sortLabelMode === 'date'
        ? 'Newest to oldest'
        : 'Z to A';

  const openFilterView = () => {
    setDraftFilters(new Set(selectedFilters ?? []));
    setDraftOperator(filterOperator ?? 'equals');
    setDraftNumberOperator(numberFilterOperator ?? 'equals');
    setDraftNumberValue(numberFilterValue ?? '');
    setView('filter');
  };

  const applyFilter = () => {
    onFilterChange?.(new Set(draftFilters));
    if (onFilterOperatorChange) onFilterOperatorChange(draftOperator);
    close();
  };

  const toggle = (val: string) => {
    setDraftFilters(current => {
      const next = new Set(current);
      if (next.has(val)) next.delete(val); else next.add(val);
      return next;
    });
  };

  const applyNumberFilter = () => {
    const value = draftNumberValue.trim();
    if (requiresNumberValue && value === '') {
      return;
    }
    onNumberFilterApply?.({ operator: draftNumberOperator, value });
    close();
  };

  const numberOperatorLabel = (() => {
    switch (draftNumberOperator) {
      case 'equals': return 'Equals';
      case 'notEquals': return 'Does not equal';
      case 'hasValue': return 'Contains data';
      case 'hasNoValue': return 'Does not contain data';
      case 'greaterThan': return 'Greater than';
      case 'greaterThanOrEqual': return 'Greater than or equal to';
      case 'lessThan': return 'Less than';
      case 'lessThanOrEqual': return 'Less than or equal to';
      default: return 'Equals';
    }
  })();

  return (
    <th
      className={`col-hdr-menu-th${dragProps?.className ? ' ' + dragProps.className : ''}`}
      style={{ cursor: 'grab', minWidth: columnWidth ? `${columnWidth}px` : undefined, width: columnWidth ? `${columnWidth}px` : undefined, ...thStyle }}
      draggable={dragProps?.draggable}
      onDragStart={dragProps?.onDragStart}
      onDragOver={dragProps?.onDragOver}
      onDragEnd={dragProps?.onDragEnd}
    >
      <span
        className="col-hdr-label"
        ref={anchorRef}
        onClick={() => { setOpen(o => !o); setView('main'); }}
        style={{ userSelect: 'none' }}
      >
        {label}
        {isSorted && <span className="col-hdr-sort-indicator">{currentSortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
        {hasFilter && <span className="col-hdr-filter-indicator" title="Filtered">&#x25BC;</span>}
        <span className="col-hdr-chevron">&#x25BE;</span>
      </span>

      {open && createPortal(
        <>
          <div className="chm-backdrop" onClick={close} />
          <div className="chm-panel" ref={menuRef} style={menuStyle} onClick={e => e.stopPropagation()}>
            {view === 'main' && (
              <>
                <button className="chm-item" onClick={() => { onSort(sortKey, 'asc'); close(); }}>
                  <span className="chm-icon">↑</span> {ascendingLabel}
                </button>
                <button className="chm-item" onClick={() => { onSort(sortKey, 'desc'); close(); }}>
                  <span className="chm-icon">↓</span> {descendingLabel}
                </button>
                {(filterOptions || supportsNumberFilter) && (
                  <>
                    <div className="chm-divider" />
                    <button className="chm-item" onClick={openFilterView}>
                      <span className="chm-icon"><Filter size={14} /></span> Filter by
                    </button>
                    {filterOptions && filterShortcuts && filterShortcuts.map(sc => (
                      <button key={sc.label} className="chm-item chm-item-shortcut" onClick={() => { onFilterChange!(sc.values); close(); }}>
                        <span className="chm-icon">&#x2713;</span> {sc.label}
                      </button>
                    ))}
                    {filterOptions && hasFilter && (
                      <button className="chm-item chm-item-clear" onClick={() => { onFilterChange!(new Set()); close(); }}>
                        <span className="chm-icon"><FilterX size={14} /></span> Clear filter
                      </button>
                    )}
                    {supportsNumberFilter && hasNumberFilter && (
                      <button className="chm-item chm-item-clear" onClick={() => { onNumberFilterClear?.(); close(); }}>
                        <span className="chm-icon"><FilterX size={14} /></span> Clear filter
                      </button>
                    )}
                  </>
                )}
                <div className="chm-divider" />
                <button className="chm-item" onClick={() => setView('width')}>
                  <span className="chm-icon">↔</span> Column width
                </button>
              </>
            )}

            {view === 'filter' && filterOptions && selectedFilters && onFilterChange && (
              <div className="chm-filter-view">
                <div className="chm-filter-header">
                  <h4>Filter by</h4>
                  <button className="chm-close" onClick={close}>✕</button>
                </div>
                {onFilterOperatorChange && (
                  <div className="chm-operator-wrapper">
                    <button className="chm-operator-btn" onClick={() => setOperatorOpen(o => !o)}>
                      {draftOperator === 'notEquals' ? 'Does not equal' : 'Equals'}
                      <span className="chm-operator-chevron">&#x25BE;</span>
                    </button>
                    {operatorOpen && (
                      <div className="chm-operator-dropdown">
                        <button className={`chm-operator-opt${draftOperator === 'equals' ? ' active' : ''}`} onClick={() => { setDraftOperator('equals'); setOperatorOpen(false); }}>Equals</button>
                        <button className={`chm-operator-opt${draftOperator === 'notEquals' ? ' active' : ''}`} onClick={() => { setDraftOperator('notEquals'); setOperatorOpen(false); }}>Does not equal</button>
                      </div>
                    )}
                  </div>
                )}
                <div className="chm-values">
                  {filterOptions.map(opt => (
                    <label key={opt} className="chm-value-item">
                      <input type="checkbox" checked={draftFilters.has(opt)} onChange={() => toggle(opt)} />
                      <span>{filterOptionLabels?.[opt] ?? opt}</span>
                    </label>
                  ))}
                </div>
                <div className="chm-filter-actions">
                  <button className="chm-apply" onClick={applyFilter}>Apply</button>
                  <button className="chm-clear" onClick={() => { onFilterChange(new Set()); close(); }}>Clear filter</button>
                </div>
              </div>
            )}

            {view === 'filter' && supportsNumberFilter && (
              <div className="chm-filter-view">
                <div className="chm-filter-header">
                  <h4>Filter by</h4>
                  <button className="chm-close" onClick={close}>✕</button>
                </div>
                <div className="chm-operator-wrapper">
                  <button className="chm-operator-btn" onClick={() => setOperatorOpen(o => !o)}>
                    {numberOperatorLabel}
                    <span className="chm-operator-chevron">&#x25BE;</span>
                  </button>
                  {operatorOpen && (
                    <div className="chm-operator-dropdown">
                      <button className={`chm-operator-opt${draftNumberOperator === 'equals' ? ' active' : ''}`} onClick={() => { setDraftNumberOperator('equals'); setOperatorOpen(false); }}>Equals</button>
                      <button className={`chm-operator-opt${draftNumberOperator === 'notEquals' ? ' active' : ''}`} onClick={() => { setDraftNumberOperator('notEquals'); setOperatorOpen(false); }}>Does not equal</button>
                      <button className={`chm-operator-opt${draftNumberOperator === 'hasValue' ? ' active' : ''}`} onClick={() => { setDraftNumberOperator('hasValue'); setOperatorOpen(false); }}>Contains data</button>
                      <button className={`chm-operator-opt${draftNumberOperator === 'hasNoValue' ? ' active' : ''}`} onClick={() => { setDraftNumberOperator('hasNoValue'); setOperatorOpen(false); }}>Does not contain data</button>
                      <button className={`chm-operator-opt${draftNumberOperator === 'greaterThan' ? ' active' : ''}`} onClick={() => { setDraftNumberOperator('greaterThan'); setOperatorOpen(false); }}>Greater than</button>
                      <button className={`chm-operator-opt${draftNumberOperator === 'greaterThanOrEqual' ? ' active' : ''}`} onClick={() => { setDraftNumberOperator('greaterThanOrEqual'); setOperatorOpen(false); }}>Greater than or equal to</button>
                      <button className={`chm-operator-opt${draftNumberOperator === 'lessThan' ? ' active' : ''}`} onClick={() => { setDraftNumberOperator('lessThan'); setOperatorOpen(false); }}>Less than</button>
                      <button className={`chm-operator-opt${draftNumberOperator === 'lessThanOrEqual' ? ' active' : ''}`} onClick={() => { setDraftNumberOperator('lessThanOrEqual'); setOperatorOpen(false); }}>Less than or equal to</button>
                    </div>
                  )}
                </div>
                {requiresNumberValue && (
                  <input
                    className="chm-width-input"
                    type="number"
                    value={draftNumberValue}
                    placeholder="Value"
                    onChange={e => setDraftNumberValue(e.target.value)}
                  />
                )}
                <div className="chm-filter-actions">
                  <button className="chm-apply" disabled={requiresNumberValue && draftNumberValue.trim() === ''} onClick={applyNumberFilter}>Apply</button>
                  <button className="chm-clear" onClick={() => { onNumberFilterClear?.(); close(); }}>Clear filter</button>
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
        </>,
        document.body
      )}
    </th>
  );
}
