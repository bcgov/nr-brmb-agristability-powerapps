import { useState } from 'react';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import { ProcessEnrolmentActionService } from '../generated/services/ProcessEnrolmentActionService';

export function ReferToSupervisorModal({
  selectedIds,
  rows,
  onClose,
  onComplete,
  onError,
}: {
  selectedIds: Set<string>;
  rows: Vsi_participantprogramyears[];
  onClose: () => void;
  onComplete: (updatedIds: string[]) => void;
  onError?: (message: string) => void;
}) {

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Utility to sanitize error messages (removes URLs and HelpLinks)
  function sanitizeError(msg: string | null): string | null {
    if (!msg) return null;
    // Remove URLs (http, https, www)
    let sanitized = msg.replace(/https?:\/\/\S+/gi, '').replace(/www\.[^\s]+/gi, '');
    // Remove Microsoft.PowerApps.CDS.HelpLink and similar patterns
    sanitized = sanitized.replace(/Microsoft\.PowerApps\.CDS\.HelpLink.*?(?=\s|$)/gi, '');
    // Remove any leftover HTML tags
    sanitized = sanitized.replace(/<[^>]+>/g, '');
    return sanitized.trim();
  }
  const selectedRows = rows.filter(r => selectedIds.has(r.vsi_participantprogramyearid));
  const noSelection = selectedRows.length === 0;
  const alreadySupervisorRows = selectedRows.filter(r => r.vsi_taskstatus === 865520001);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const rowsToProcess = selectedRows.filter(r => r.vsi_taskstatus !== 865520001);
      if (rowsToProcess.length === 0) {
        onClose();
        return;
      }

      const result = await ProcessEnrolmentActionService.Run({
        text: rowsToProcess.map(r => r.vsi_participantprogramyearid).join(','),
        text_1: 'refer',
        text_2: '',
      });

      if (!result.success) {
        const msg = (result.error as { message?: string } | undefined)?.message ?? 'Failed to refer to supervisor';
        throw new Error(msg);
      }

      // Flow may return a message (e.g. error details from Dataverse)
      const flowMessage = result.data?.message;
      if (flowMessage && flowMessage.toLowerCase() !== 'success') {
        throw new Error(flowMessage);
      }

      onComplete(rowsToProcess.map(r => r.vsi_participantprogramyearid));
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to refer to supervisor';
      setError(sanitizeError(msg));
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Refer to Supervisor</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {noSelection ? (
            <div className="no-selection-message">No Enrolments Selected</div>
          ) : (
            <>
              <p>
                This will assign {selectedIds.size} enrolment{selectedIds.size !== 1 ? 's' : ''} to
                the <strong>Supervisor Approval Queue</strong> and set their task status
                to <strong>Supervisor</strong>.
              </p>
              {alreadySupervisorRows.length > 0 && (
                <p className="modal-warning">
                  {alreadySupervisorRows.length === selectedRows.length
                    ? 'All selected enrolments are already assigned to supervisor.'
                    : `${alreadySupervisorRows.length} of the selected enrolment${alreadySupervisorRows.length !== 1 ? 's are' : ' is'} already assigned to supervisor.`}
                </p>
              )}
              <div className="modal-selected-list">
                <table className="selected-enrolments-table">
                  <tbody>
                    {selectedRows.map((r, i) => {
                        const isSupervisor = r.vsi_taskstatus === 865520001;
                        return (
                          <tr key={r.vsi_participantprogramyearid} className={isSupervisor ? 'row-already-supervisor' : ''}>
                            <td className="selected-row-num">{i + 1}</td>
                            <td>{r.vsi_name ?? ''}</td>
                            <td>{isSupervisor && <span className="already-supervisor-badge">Already assigned</span>}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="btn-ok"
            disabled={submitting || noSelection}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting...' : 'Confirm'}
          </button>
          <button className="btn-cancel" disabled={submitting} onClick={onClose}>Cancel</button>
          {error && <span className="modal-error">{sanitizeError(error)}</span>}
        </div>
      </div>
    </div>
  );
}
