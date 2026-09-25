import { useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  enrolmentName?: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
};

export function Pause45DayCounterModal({ enrolmentName, loading = false, error, onConfirm, onCancel }: Props) {
  const [comment, setComment] = useState('');
  const trimmed = comment.trim();
  const canSubmit = trimmed.length > 0 && !loading;

  return createPortal(
    <div className="modal-overlay" onClick={loading ? undefined : onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Pause 45-Day Counter</h3>
            {enrolmentName && <p className="modal-subtitle">{enrolmentName}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onCancel} disabled={loading}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="modal-field">
            <label htmlFor="pause-45day-comment">
              Reason for pause <span className="modal-required">*</span>
            </label>
            <textarea
              id="pause-45day-comment"
              className="modal-textarea"
              rows={4}
              value={comment}
              onChange={e => setComment(e.target.value)}
              disabled={loading}
              placeholder="Enter the reason for pausing the 45-day counter"
              autoFocus
            />
          </div>
          {error && <p className="calc-fortyfiveday-error" style={{ marginTop: 8 }}>{error}</p>}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn-ok"
            onClick={() => canSubmit && onConfirm(trimmed)}
            disabled={!canSubmit}
          >
            {loading ? 'Pausing...' : 'Pause Counter'}
          </button>
          <button type="button" className="btn-cancel" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
