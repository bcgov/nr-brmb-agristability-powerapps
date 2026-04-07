import { useState } from 'react';
import type { SortKey } from '../types/enrollment';
import { ALL_COLUMNS, DEFAULT_VISIBLE_KEYS } from '../constants/columns';

function AddColumnsPanel({
  visibleKeys,
  onAdd,
  onClose,
}: {
  visibleKeys: SortKey[];
  onAdd: (keys: SortKey[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<SortKey>>(new Set());

  const available = ALL_COLUMNS.filter(c => !visibleKeys.includes(c.key));
  const filtered = search
    ? available.filter(c => c.label.toLowerCase().includes(search.toLowerCase()))
    : available;

  const toggle = (k: SortKey) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  return (
    <div className="ec-overlay" onClick={onClose}>
      <div className="ec-panel" onClick={e => e.stopPropagation()}>
        <div className="ec-header">
          <h3>Add columns</h3>
          <button className="ec-close" onClick={onClose}>&times;</button>
        </div>
        <div className="ec-search-bar">
          <input
            className="ec-search-input"
            type="text"
            placeholder="Search"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="ec-body">
          {filtered.length === 0 ? (
            <div className="ec-empty">No columns available</div>
          ) : (
            filtered.map(c => (
              <label key={c.key} className="ec-add-item">
                <input
                  type="checkbox"
                  checked={selected.has(c.key)}
                  onChange={() => toggle(c.key)}
                />
                <span className="ec-col-icon">{c.icon}</span>
                <span className="ec-col-label">{c.label}</span>
              </label>
            ))
          )}
        </div>
        <div className="ec-footer">
          <button className="ec-apply" disabled={selected.size === 0} onClick={() => onAdd([...selected])}>Add</button>
          <button className="ec-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function EditColumnsPanel({
  visibleKeys,
  onApply,
  onCancel,
}: {
  visibleKeys: SortKey[];
  onApply: (keys: SortKey[]) => void;
  onCancel: () => void;
}) {
  const [keys, setKeys] = useState<SortKey[]>([...visibleKeys]);
  const [showAdd, setShowAdd] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const remove = (k: SortKey) => {
    const def = ALL_COLUMNS.find(c => c.key === k);
    if (def && !def.removable) return;
    setKeys(prev => prev.filter(x => x !== k));
  };

  const resetToDefault = () => setKeys([...DEFAULT_VISIBLE_KEYS]);

  const handleDragStart = (i: number) => setDragIdx(i);
  const handleDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) return;
    setKeys(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setDragIdx(i);
  };
  const handleDragEnd = () => setDragIdx(null);

  const addColumns = (toAdd: SortKey[]) => {
    setKeys(prev => [...prev, ...toAdd.filter(k => !prev.includes(k))]);
    setShowAdd(false);
  };

  if (showAdd) {
    return (
      <AddColumnsPanel
        visibleKeys={keys}
        onAdd={addColumns}
        onClose={() => setShowAdd(false)}
      />
    );
  }

  return (
    <div className="ec-overlay" onClick={onCancel}>
      <div className="ec-panel" onClick={e => e.stopPropagation()}>
        <div className="ec-header">
          <h3>Edit columns: Enrolments</h3>
          <button className="ec-close" onClick={onCancel}>&times;</button>
        </div>
        <div className="ec-toolbar">
          <button className="ec-toolbar-btn" onClick={() => setShowAdd(true)}>
            <span className="ec-tb-icon">+</span> Add columns
          </button>
          <button className="ec-toolbar-btn" onClick={resetToDefault}>
            <span className="ec-tb-icon">↩</span> Reset to default
          </button>
        </div>
        <div className="ec-body">
          {keys.map((k, i) => {
            const def = ALL_COLUMNS.find(c => c.key === k);
            if (!def) return null;
            return (
              <div
                key={k}
                className={`ec-col-item${dragIdx === i ? ' ec-col-dragging' : ''}`}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={e => handleDragOver(e, i)}
                onDragEnd={handleDragEnd}
              >
                <span className="ec-col-icon">{def.icon}</span>
                <span className="ec-col-label">{def.label}</span>
                {def.removable && (
                  <button className="ec-col-remove" onClick={() => remove(k)} title="Remove column">&times;</button>
                )}
              </div>
            );
          })}
        </div>
        <div className="ec-footer">
          <button className="ec-apply" onClick={() => onApply(keys)}>Apply</button>
          <button className="ec-cancel" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
