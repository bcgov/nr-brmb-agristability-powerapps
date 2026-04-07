import { useState } from 'react';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

export function BulkNoticesModal({
  selectedIds,
  rows,
  onClose,
}: {
  selectedIds: Set<string>;
  rows: Vsi_participantprogramyears[];
  onClose: () => void;
}) {
  const [bulkSentDate, setBulkSentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bulkFeeDate, setBulkFeeDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [bulkMergedPdf, setBulkMergedPdf] = useState(true);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Generate Bulk Enrolment Notices</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <label className="modal-field">
            <span>Enrolment Sent Date:</span>
            <input type="date" value={bulkSentDate} onChange={e => setBulkSentDate(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>Enrolment Fee Date:</span>
            <input type="date" value={bulkFeeDate} onChange={e => setBulkFeeDate(e.target.value)} />
          </label>
          <label className="modal-checkbox">
            <input type="checkbox" checked={bulkMergedPdf} onChange={e => setBulkMergedPdf(e.target.checked)} />
            Produce Merged PDF
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn-ok" disabled={bulkSubmitting || selectedIds.size === 0} onClick={async () => {
            setBulkSubmitting(true);
            setBulkError(null);
            try {
              const client = getClient(dataSourcesInfo);
              await (client as any).executeAsync({
                dataverseRequest: {
                  action: 'vsi_GenerateBulkEnrolmentNotices',
                  parameters: {
                    EnrolmentIds: JSON.stringify([...selectedIds]),
                    EnrolmentSentDate: bulkSentDate,
                    EnrolmentFeeDate: bulkFeeDate,
                    ProduceMergedPdf: bulkMergedPdf,
                  },
                },
              });
              onClose();
            } catch (err) {
              setBulkError(err instanceof Error ? err.message : 'Workflow failed');
            } finally {
              setBulkSubmitting(false);
            }
          }}>{bulkSubmitting ? 'Submitting…' : 'OK'}</button>
          <button className="btn-cancel" disabled={bulkSubmitting} onClick={onClose}>Cancel</button>
          {bulkError && <span className="modal-error">{bulkError}</span>}
        </div>
        {selectedIds.size > 0 && (
          <div className="modal-selected-list">
            <table className="selected-enrolments-table">
              <tbody>
                {rows
                  .filter(r => selectedIds.has(r.vsi_participantprogramyearid))
                  .map((r, i) => (
                    <tr key={r.vsi_participantprogramyearid}>
                      <td className="selected-row-num">{i + 1}</td>
                      <td>{r.vsi_name ?? ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
