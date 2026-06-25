
import { useState } from 'react';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import { ProcessEnrolmentActionService } from '../generated/services/ProcessEnrolmentActionService';
import { resolveCurrentSystemUser } from '../utils/currentUser';

type ApprovedEnrolmentUpdate = {
  id: string;
  approverId: string;
  approverName: string;
  approvedDate: string;
};

export function ApproveCalculatedFeesModal({
  selectedIds,
  rows,
  onClose,
  onComplete,
  onError,
}: {
  selectedIds: Set<string>;
  rows: Vsi_participantprogramyears[];
  onClose: () => void;
  onComplete: (updates: ApprovedEnrolmentUpdate[]) => void;
  onError?: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const APPROVABLE_ENROL_STATUSES = new Set([865520005, 865520006]); // UnverifiedENCalculated, VerifiedENCalculalted
  const selectedRows = rows.filter(r => selectedIds.has(r.vsi_participantprogramyearid));
  const notReadyRows = selectedRows.filter(r => r.vsi_taskstatus !== 865520002);
  const invalidStatusRows = selectedRows.filter(r => !APPROVABLE_ENROL_STATUSES.has(r.vsi_enrolmentstatus as unknown as number));
  const missingFeeRows = selectedRows.filter(r => r.vsi_enrolmentfee == null);
  const noSelection = selectedRows.length === 0;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const approvedDate = new Date().toISOString();
      const currentUser = await resolveCurrentSystemUser();
      const result = await ProcessEnrolmentActionService.Run({
        text: selectedRows.map(r => r.vsi_participantprogramyearid).join(','),
        text_1: 'approve',
        text_2: currentUser.systemUserId,
      }, '2015-02-01-preview');
      if (!result.success) {
        const msg = (result.error as { message?: string } | undefined)?.message ?? 'Failed to approve calculated fees';
        throw new Error(msg);
      }
      const flowMessage = result.data?.message;
      if (flowMessage && flowMessage.toLowerCase() !== 'success') {
        throw new Error(flowMessage);
      }
      const updates: ApprovedEnrolmentUpdate[] = selectedRows.map(row => ({
        id: row.vsi_participantprogramyearid,
        approverId: '',
        approverName: '',
        approvedDate,
      }));
      onComplete(updates);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to approve calculated fees';
      setError(msg);
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Approve Calculated Fees</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {noSelection ? (
            <div className="no-selection-message">No Enrolments Selected</div>
          ) : notReadyRows.length > 0 || invalidStatusRows.length > 0 || missingFeeRows.length > 0 ? (
            <div className="no-selection-message">
              Only enrolments with status <b>Ready</b>, enrolment status <b>Verified EN Calculated</b> or <b>Unverified EN Calculated</b>, <u>and</u> a calculated fee can be approved. Please adjust your selection.
            </div>
          ) : (
            <>
              <p>
                This will approve calculated fees and remove any queue items for {selectedIds.size} enrolment{selectedIds.size !== 1 ? 's' : ''}.
              </p>
              <div className="modal-selected-list">
                <table className="selected-enrolments-table">
                  <tbody>
                    {selectedRows.map((r, i) => (
                        <tr key={r.vsi_participantprogramyearid}>
                          <td className="selected-row-num">{i + 1}</td>
                          <td>{r.vsi_name ?? ''}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="btn-ok"
            disabled={submitting || noSelection || notReadyRows.length > 0 || invalidStatusRows.length > 0 || missingFeeRows.length > 0}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting...' : 'Confirm'}
          </button>
          <button className="btn-cancel" disabled={submitting} onClick={onClose}>Cancel</button>
          {error && <span className="modal-error">{error}</span>}
        </div>
      </div>
    </div>
  );
}
