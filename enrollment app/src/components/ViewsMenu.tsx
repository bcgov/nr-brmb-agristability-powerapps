import { useRef, useState } from 'react';
import type { PersonalView } from '../types/enrollment';

export function ViewsMenu({
  views,
  activeViewId,
  hasUnsavedChanges,
  onSelectView,
  onSaveAsNew,
  onSaveCurrentView,
  onResetDefault,
  onDeleteView,
  onRenameView,
  viewsLoading,
}: {
  views: PersonalView[];
  activeViewId: string | null;
  hasUnsavedChanges: boolean;
  onSelectView: (id: string | null) => void;
  onSaveAsNew: (name: string) => void;
  onSaveCurrentView: () => void;
  onResetDefault: () => void;
  onDeleteView: (id: string) => void;
  onRenameView: (id: string, name: string) => void;
  viewsLoading?: boolean;
}) {
  const systemViews = views.filter(v => v.source === 'system');
  const personalViews = views.filter(v => v.source === 'personal');
  const activeView = views.find(v => v.id === activeViewId);
  const activeIsPersonal = activeView?.source === 'personal';
  const [open, setOpen] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const currentView = views.find(v => v.id === activeViewId);
  const displayName = currentView ? currentView.name : 'Enrolments';

  const filteredSystem = search
    ? systemViews.filter(v => v.name.toLowerCase().includes(search.toLowerCase()))
    : systemViews;
  const filteredPersonal = search
    ? personalViews.filter(v => v.name.toLowerCase().includes(search.toLowerCase()))
    : personalViews;

  const close = () => { setOpen(false); setShowSaveAs(false); setNewName(''); setSearch(''); setRenamingId(null); };

  const handleSaveAs = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onSaveAsNew(trimmed);
    close();
  };

  return (
    <div className="vm-wrapper" ref={menuRef}>
      <button className="vm-trigger" onClick={() => setOpen(o => !o)}>
        <span className="vm-title">{displayName}{hasUnsavedChanges ? '*' : ''}</span>
        <span className="vm-chevron">&#x25BE;</span>
      </button>

      {open && (
        <>
          <div className="vm-backdrop" onClick={close} />
          <div className="vm-panel" onClick={e => e.stopPropagation()}>
            {!showSaveAs ? (
              <>
                <div className="vm-search">
                  <input
                    className="vm-search-input"
                    type="text"
                    placeholder="Search views"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="vm-list">
                  {viewsLoading && <div className="vm-loading">Loading views…</div>}

                  {filteredPersonal.length > 0 && (
                    <div className="vm-section-label">My Views</div>
                  )}
                  {filteredPersonal.map(v => (
                    <div key={v.id} className={`vm-item${v.id === activeViewId ? ' vm-item-active' : ''}`}>
                      {renamingId === v.id ? (
                        <div className="vm-rename-row">
                          <input
                            className="vm-rename-input"
                            value={renameText}
                            onChange={e => setRenameText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { onRenameView(v.id, renameText.trim()); setRenamingId(null); }
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            autoFocus
                          />
                          <button className="vm-rename-ok" onClick={() => { onRenameView(v.id, renameText.trim()); setRenamingId(null); }}>✓</button>
                        </div>
                      ) : (
                        <>
                          <button className="vm-item-btn" onClick={() => { onSelectView(v.id); close(); }}>
                            {v.id === activeViewId && <span className="vm-check">✓</span>}
                            <span className="vm-item-name">{v.name}</span>
                          </button>
                          <div className="vm-item-actions">
                            <button className="vm-item-action" title="Rename" onClick={() => { setRenamingId(v.id); setRenameText(v.name); }}>✏</button>
                            <button className="vm-item-action" title="Delete" onClick={() => { onDeleteView(v.id); }}>🗑</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {filteredSystem.length > 0 && (
                    <div className="vm-section-label">System Views</div>
                  )}
                  {filteredSystem.map(v => (
                    <div key={v.id} className={`vm-item${v.id === activeViewId ? ' vm-item-active' : ''}`}>
                      <button className="vm-item-btn" onClick={() => { onSelectView(v.id); close(); }}>
                        {v.id === activeViewId && <span className="vm-check">✓</span>}
                        <span className="vm-item-name">{v.name}</span>
                      </button>
                    </div>
                  ))}

                  <div className="vm-divider" />
                  <div className={`vm-item${activeViewId === null ? ' vm-item-active' : ''}`}>
                    <button className="vm-item-btn" onClick={() => { onSelectView(null); close(); }}>
                      {activeViewId === null && <span className="vm-check">✓</span>}
                      <span className="vm-item-name">Enrolments</span>
                      <span className="vm-item-tag">Default</span>
                    </button>
                  </div>
                </div>
                <div className="vm-divider" />
                {hasUnsavedChanges && activeViewId && activeIsPersonal && (
                  <button className="vm-action" onClick={() => { onSaveCurrentView(); close(); }}>
                    <span className="vm-action-icon">💾</span> Save changes to current view
                  </button>
                )}
                <button className="vm-action" onClick={() => setShowSaveAs(true)}>
                  <span className="vm-action-icon">📋</span> Save as new view
                </button>
                <button className="vm-action" onClick={() => { onResetDefault(); close(); }}>
                  <span className="vm-action-icon">↩</span> Reset default view
                </button>
              </>
            ) : (
              <div className="vm-save-as">
                <div className="vm-save-as-header">
                  <h4>Save as new view</h4>
                  <button className="vm-save-as-close" onClick={() => setShowSaveAs(false)}>✕</button>
                </div>
                <label className="vm-save-as-label">View name</label>
                <input
                  className="vm-save-as-input"
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveAs(); }}
                  placeholder="My custom view"
                  autoFocus
                />
                <div className="vm-save-as-footer">
                  <button className="vm-save-as-ok" onClick={handleSaveAs} disabled={!newName.trim()}>Save</button>
                  <button className="vm-save-as-cancel" onClick={() => setShowSaveAs(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
