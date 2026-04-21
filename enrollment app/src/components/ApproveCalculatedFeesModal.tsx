
import { useState } from 'react';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import { QueueitemsService } from '../generated/services/QueueitemsService';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
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
}: {
  selectedIds: Set<string>;
  rows: Vsi_participantprogramyears[];
  onClose: () => void;
  onComplete: (updates: ApprovedEnrolmentUpdate[]) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRows = rows.filter(r => selectedIds.has(r.vsi_participantprogramyearid));
  const notReadyRows = selectedRows.filter(r => r.vsi_taskstatus !== 865520002); // 865520002 = Ready
  // Use model enum for status comparison
  // const notReadyRows = selectedRows.filter(r => r.vsi_taskstatus !== Vsi_participantprogramyearsvsi_taskstatus.Ready);
  const noSelection = selectedRows.length === 0;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const currentUser = await resolveCurrentSystemUser();
      const approvedDate = new Date().toISOString();
      const updates: ApprovedEnrolmentUpdate[] = [];

      for (const row of selectedRows) {
        const enrolmentId = row.vsi_participantprogramyearid;
        // Remove all queueitems for this enrolment
        try {
          const queueitemResult = await QueueitemsService.getAll({
            filter: `objectid_vsi_participantprogramyear/vsi_participantprogramyearid eq '${enrolmentId}' and statecode eq 0`,
            select: ['queueitemid'],
          });
          if (queueitemResult.data) {
            for (const qi of queueitemResult.data) {
              await QueueitemsService.delete(qi.queueitemid);
            }
          }
        } catch (err) {
          // Ignore if not found, continue
        }
        // Set task status to Approved
        const updateResult = await Vsi_participantprogramyearsService.update(enrolmentId, {
          vsi_taskstatus: 865520003, // Vsi_participantprogramyearsvsi_taskstatus.Approved

        });
        if (!updateResult.success) {
          throw new Error(updateResult.error?.message ?? `Failed to approve ${row.vsi_name ?? enrolmentId}.`);
        }

        updates.push({
          id: enrolmentId,
          approverId: currentUser.systemUserId,
          approverName: currentUser.displayName,
          approvedDate,
        });
      }
      onComplete(updates);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve calculated fees');
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
          ) : notReadyRows.length > 0 ? (
            <div className="no-selection-message">Only enrolments with status <b>Ready</b> can be approved. Please adjust your selection.</div>
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
            disabled={submitting || noSelection || notReadyRows.length > 0}
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
