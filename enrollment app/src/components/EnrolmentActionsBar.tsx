import { FileText, UserCheck, CircleCheck } from 'lucide-react';

type Props = {
  hasSelection: boolean;
  onOpenBulkNotices: () => void;
  onOpenReferToSupervisor: () => void;
  onOpenApproveCalculatedFees: () => void;
};

export function EnrolmentActionsBar({ hasSelection, onOpenBulkNotices, onOpenReferToSupervisor, onOpenApproveCalculatedFees }: Props) {
  return (
    <div className="enrolment-actions">
      <button className="dash-btn-secondary" onClick={onOpenBulkNotices} disabled={!hasSelection}>
        <FileText size={15} /> Bulk EN Notices
      </button>
      <button className="dash-btn-secondary" onClick={onOpenReferToSupervisor} disabled={!hasSelection}>
        <UserCheck size={15} /> Refer to Supervisor
      </button>
      <button className="dash-btn-primary" onClick={onOpenApproveCalculatedFees} disabled={!hasSelection}>
        <CircleCheck size={15} /> Approve Calculated Fees
      </button>
    </div>
  );
}

