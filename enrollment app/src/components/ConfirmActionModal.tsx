// ...existing code...

export function ConfirmActionModal({
  title,
  message,
  enrolments,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
}: {
  title: string;
  message: string;
  enrolments?: Array<{ id: string; name: string }>;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onCancel}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="no-selection-message">{message}</div>
          {enrolments && enrolments.length > 0 && (
            <div className="modal-selected-list" style={{ marginTop: 16 }}>
              <table className="selected-enrolments-table">
                <tbody>
                  {enrolments.map((r, i) => (
                    <tr key={r.id}>
                      <td className="selected-row-num">{i + 1}</td>
                      <td>{r.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-ok" onClick={onConfirm} disabled={loading}>{loading ? 'Processing...' : confirmLabel}</button>
          <button className="btn-cancel" onClick={onCancel} disabled={loading}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}
