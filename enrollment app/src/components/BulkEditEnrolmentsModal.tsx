import { useMemo, useState } from 'react';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import {
  Vsi_participantprogramyearsvsi_enrolmentstatus,
  Vsi_participantprogramyearsvsi_taskstatus,
} from '../generated/models/Vsi_participantprogramyearsModel';
import { BulkUpdateEnrolmentRecordsService } from '../generated/services/BulkUpdateEnrolmentRecordsService';
import { formatEnrolmentStatusDisplay } from '../utils/helpers';

const NO_CHANGE_NUMBER = 0;
const NO_CHANGE_DATE = '1900-01-01';

type BulkEditUpdate = {
  ids: string[];
  taskStatus: number | null;
  enrolmentStatus: number | null;
  finalDeadlineDate: string | null;
  lateFinalDeadlineDate: string | null;
};

type Props = {
  selectedIds: Set<string>;
  rows: Vsi_participantprogramyears[];
  onClose: () => void;
  onComplete: (update: BulkEditUpdate) => void;
  onError?: (message: string) => void;
};

export function BulkEditEnrolmentsModal({
  selectedIds,
  rows,
  onClose,
  onComplete,
  onError,
}: Props) {
  const [taskStatus, setTaskStatus] = useState('');
  const [enrolmentStatus, setEnrolmentStatus] = useState('');
  const [finalDeadlineDate, setFinalDeadlineDate] = useState('');
  const [lateFinalDeadlineDate, setLateFinalDeadlineDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRows = rows.filter(r => selectedIds.has(r.vsi_participantprogramyearid));
  const noSelection = selectedRows.length === 0;
  const hasAnyChange = Boolean(taskStatus || enrolmentStatus || finalDeadlineDate || lateFinalDeadlineDate);
  const canSubmit = Boolean(!noSelection && hasAnyChange);

  const taskStatusOptions = useMemo(
    () => Object.entries(Vsi_participantprogramyearsvsi_taskstatus).map(([value, label]) => ({
      value,
      label,
    })),
    [],
  );

  const enrolmentStatusOptions = useMemo(
    () => Object.entries(Vsi_participantprogramyearsvsi_enrolmentstatus).map(([value, label]) => ({
      value,
      label: formatEnrolmentStatusDisplay(label),
    })),
    [],
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      const update: BulkEditUpdate = {
        ids,
        taskStatus: taskStatus ? Number(taskStatus) : null,
        enrolmentStatus: enrolmentStatus ? Number(enrolmentStatus) : null,
        finalDeadlineDate: finalDeadlineDate || null,
        lateFinalDeadlineDate: lateFinalDeadlineDate || null,
      };

      const result = await BulkUpdateEnrolmentRecordsService.Run({
        text: ids.join(','),
        number: update.taskStatus ?? NO_CHANGE_NUMBER,
        number_1: update.enrolmentStatus ?? NO_CHANGE_NUMBER,
        date: update.finalDeadlineDate ?? NO_CHANGE_DATE,
        date_1: update.lateFinalDeadlineDate ?? NO_CHANGE_DATE,
      });

      if (!result.success) {
        const msg = (result.error as { message?: string } | undefined)?.message ?? 'Bulk update failed';
        throw new Error(msg);
      }

      const flowMessage = result.data?.message;
      if (flowMessage && !['success', 'done'].includes(flowMessage.toLowerCase())) {
        throw new Error(flowMessage);
      }

      onComplete(update);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bulk update failed';
      setError(msg);
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={submitting ? undefined : onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Bulk Edit Enrolments</h3>
          {!submitting && <button type="button" className="modal-close" onClick={onClose}>&times;</button>}
        </div>
        <div className="modal-body">
          {noSelection ? (
            <div className="no-selection-message">No Enrolments Selected</div>
          ) : (
            <>
              <p className="modal-help-text">
                This will update {selectedIds.size} enrolment{selectedIds.size === 1 ? '' : 's'}. Leave fields blank to keep them unchanged.
              </p>
              <label className="modal-field">
                <span>Task Status</span>
                <select value={taskStatus} onChange={e => setTaskStatus(e.target.value)} disabled={submitting}>
                  <option value="">No change</option>
                  {taskStatusOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field">
                <span>Enrolment Status</span>
                <select value={enrolmentStatus} onChange={e => setEnrolmentStatus(e.target.value)} disabled={submitting}>
                  <option value="">No change</option>
                  {enrolmentStatusOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="modal-field">
                <span>Enrolment Fees Final Deadline Date</span>
                <input
                  type="date"
                  value={finalDeadlineDate}
                  onChange={e => setFinalDeadlineDate(e.target.value)}
                  disabled={submitting}
                />
              </label>
              <label className="modal-field">
                <span>Late Enrolment Fees Final Deadline Date</span>
                <input
                  type="date"
                  value={lateFinalDeadlineDate}
                  onChange={e => setLateFinalDeadlineDate(e.target.value)}
                  disabled={submitting}
                />
              </label>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn-ok"
            disabled={submitting || !canSubmit}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" className="btn-cancel" disabled={submitting} onClick={onClose}>Cancel</button>
          {error && <span className="modal-error">{error}</span>}
        </div>
        {!noSelection && (
          <div className="modal-selected-list">
            <table className="selected-enrolments-table">
              <tbody>
                {selectedRows.map((row, i) => (
                  <tr key={row.vsi_participantprogramyearid}>
                    <td className="selected-row-num">{i + 1}</td>
                    <td>{row.vsi_name ?? ''}</td>
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
