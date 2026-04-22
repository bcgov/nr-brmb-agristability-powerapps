import type { PersonalView } from '../types/enrollment';

export function ManageViewsModal({
  views,
  onShare,
  onClose,
}: {
  views: PersonalView[];
  onShare: (view: PersonalView) => void;
  onClose: () => void;
}) {
  const allSorted = views
    .filter(v => v.source === 'personal')
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mvm-backdrop" onClick={onClose}>
      <div className="mvm-modal" onClick={e => e.stopPropagation()}>
        <div className="mvm-header">
          <span className="mvm-title">Manage and share views: Enrolments</span>
          <button className="mvm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="mvm-list">
          {allSorted.map(v => (
            <div key={v.id} className="mvm-row">
              <span className="mvm-row-name">
                {v.name}
                <span className="mvm-personal-icon" title="Personal view">👤</span>
              </span>
              <button
                  className="mvm-share-btn"
                  onClick={() => onShare(v)}
                  title={`Share "${v.name}"`}
                >
                  Share
                </button>
            </div>
          ))}
          {allSorted.length === 0 && (
            <div className="mvm-empty">No views available.</div>
          )}
        </div>

        <div className="mvm-footer">
          <button className="mvm-close-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
