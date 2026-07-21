import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Generate45DayLetterService } from '../generated/services/Generate45DayLetterService';
import { Vsi_programyearsService } from '../generated/services/Vsi_programyearsService';

type MissingInfoType = 'Statement A' | 'Production Information' | 'All Reference Years';
type MissingItem = { id: number; year: string; type: MissingInfoType };

type Props = {
  enrolmentId: string;
  enrolmentName: string;
  programYear: string;
  onClose: () => void;
  onSuccess: () => void;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

let nextId = 1;

export function Send45DayLetterModal({ enrolmentId, enrolmentName, programYear, onClose, onSuccess }: Props) {
  const [letterDate, setLetterDate] = useState(todayIso());
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [yearsLoading, setYearsLoading] = useState(true);
  const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Vsi_programyearsService.getAll({ select: ['vsi_year'], filter: "statecode eq 0 and vsi_year ne '9999'", orderBy: ['vsi_year desc'] })
      .then(result => {
        const years = (result.data ?? [])
          .map(r => r.vsi_year)
          .filter((y): y is string => !!y);
        if (programYear && !years.includes(programYear)) {
          years.unshift(programYear);
          years.sort((a, b) => Number(b) - Number(a));
        }
        setYearOptions(years);
      })
      .finally(() => setYearsLoading(false));
  }, []);

  const addMissingItem = () => {
    const defaultYear = yearOptions[0] ?? programYear ?? '';
    setMissingItems(prev => [...prev, { id: nextId++, year: defaultYear, type: 'Statement A' }]);
  };

  const updateMissingItem = (id: number, field: 'year' | 'type', value: string) => {
    setMissingItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const removeMissingItem = (id: number) => {
    setMissingItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    // Open about:blank synchronously while the user gesture is still active —
    // window.open() after an async call is treated as a popup and blocked.
    // about:blank inherits the opener's origin so we have full document access
    // and can write to it after the flow call without cross-origin blob URL issues.
    const printWindow = window.open('about:blank', '_blank');
    if (printWindow) {
      printWindow.document.write(
        '<html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;display:flex;align-items:center;' +
        'justify-content:center;height:100vh;margin:0">' +
        '<h2>Generating letter, please wait...</h2></body></html>'
      );
    }

    try {
      const parts = missingItems.map(item =>
        item.type === 'All Reference Years' ? item.type : `your ${item.year} ${item.type}`
      );
      const missingText = parts.length > 1
        ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]
        : parts[0] ?? '';
      const result = await Generate45DayLetterService.Run({
        text: enrolmentId,
        date: letterDate,
        text_1: programYear,
        text_2: missingText,
      });
      if (result.error) {
        printWindow?.close();
        const code = (result.error as { code?: number | string }).code;
        const inner = (result.error as { innerError?: { error?: { message?: string } } }).innerError?.error?.message;
        if (code === 502 || code === '502' || (result.error.message ?? '').toLowerCase().includes('badgateway')) {
          setError('The letter generation service did not respond (502 Bad Gateway). Please check the Power Automate flow run history for details.');
        } else {
          setError(inner ?? result.error.message ?? 'Failed to send 45-day letter.');
        }
      } else {
        const fileBase64 = result.data?.file;
        if (fileBase64 && printWindow && !printWindow.closed) {
          const raw = fileBase64.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');

          // Create the PDF blob in the PARENT context — the about:blank child window
          // inherits the opener's CSP (connect-src 'none') which blocks fetch() inside
          // any injected script. By doing everything here we avoid that restriction.
          let pdfBlob: Blob;
          try {
            const res = await fetch(`data:application/pdf;base64,${raw}`);
            pdfBlob = await res.blob();
          } catch {
            // fetch of data: URI blocked by CSP — decode with atob instead
            const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
            pdfBlob = new Blob([bytes], { type: 'application/pdf' });
          }
          const pdfBlobUrl = URL.createObjectURL(pdfBlob);

          // Navigate the window directly to the blob PDF — avoids frame-src CSP restrictions
          // that block blob: URLs in iframes. Top-level window navigation is not subject
          // to frame-src. The blob URL origin matches the opener so printWindow stays
          // same-origin and we can call print() on it from here.
          printWindow.location.href = pdfBlobUrl;

          setTimeout(() => {
            try { printWindow.focus(); printWindow.print(); } catch { /* ignore */ }
            setTimeout(() => URL.revokeObjectURL(pdfBlobUrl), 60_000);
          }, 2500);
        } else {
          printWindow?.close();
        }
        onSuccess();
        onClose();
      }
    } catch (err) {
      printWindow?.close();
      setError(err instanceof Error ? err.message : 'Failed to send 45-day letter.');
    } finally {
      setSubmitting(false);
    }
  };;

  return createPortal(
    <div className="modal-overlay" onClick={submitting ? undefined : onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Send 45-Day Letter</h3>
            {enrolmentName && <p className="modal-subtitle">{enrolmentName}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} disabled={submitting}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="modal-field">
            <label>Letter Date</label>
            <input
              type="date"
              value={letterDate}
              onChange={e => setLetterDate(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="modal-field">
            <label>Program Year</label>
            <span className="modal-program-year-display">{programYear}</span>
          </div>

          <div className="modal-field">
            <label>Missing Information</label>
            {missingItems.length > 0 && (
              <div className="modal-missing-info-list">
                {missingItems.map(item => (
                  <div key={item.id} className="modal-missing-info-row">
                    {item.type !== 'All Reference Years' && (
                      <select
                        value={item.year}
                        onChange={e => updateMissingItem(item.id, 'year', e.target.value)}
                        disabled={submitting || yearsLoading}
                        className="modal-missing-year-select"
                      >
                        {yearOptions.map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    )}
                    <select
                      value={item.type}
                      onChange={e => updateMissingItem(item.id, 'type', e.target.value as MissingInfoType)}
                      disabled={submitting}
                      className="modal-missing-type-select"
                    >
                      <option value="Statement A">Statement A</option>
                      <option value="Production Information">Production Information</option>
                      <option value="All Reference Years">All Reference Years</option>
                    </select>
                    <button
                      type="button"
                      className="modal-missing-remove-btn"
                      onClick={() => removeMissingItem(item.id)}
                      disabled={submitting}
                      aria-label="Remove"
                    >&times;</button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="modal-year-add-btn"
              onClick={addMissingItem}
              disabled={submitting || yearsLoading}
            >
              {yearsLoading ? 'Loading…' : '+ Add missing information'}
            </button>
          </div>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-ok" type="button" onClick={handleSubmit} disabled={submitting || yearsLoading || !letterDate || missingItems.length === 0}>
            {submitting ? 'Sending…' : 'Send Letter'}
          </button>
          <button className="btn-cancel" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
