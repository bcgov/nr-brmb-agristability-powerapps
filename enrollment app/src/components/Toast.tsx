import { useEffect, useState } from 'react';

export type ToastMessage = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

let _toastId = 1;
// eslint-disable-next-line react-refresh/only-export-components
export function nextToastId() { return _toastId++; }

export function Toast({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = setTimeout(() => setVisible(true), 10);
    // Auto-dismiss after 5 seconds
    const dismissTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 5000);
    return () => { clearTimeout(enterTimer); clearTimeout(dismissTimer); };
  }, [toast.id, onDismiss]);

  return (
    <div className={`toast toast--${toast.type} ${visible ? 'toast--visible' : ''}`}>
      <span className="toast-icon">{toast.type === 'success' ? '✓' : '✕'}</span>
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 300); }}>×</button>
    </div>
  );
}
