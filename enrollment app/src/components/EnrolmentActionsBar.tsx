import { FileText, UserCheck, CircleCheck } from 'lucide-react';

type Props = {
  onOpenBulkNotices: () => void;
  onOpenReferToSupervisor: () => void;
  onOpenApproveCalculatedFees: () => void;
};

export function EnrolmentActionsBar({ onOpenBulkNotices, onOpenReferToSupervisor, onOpenApproveCalculatedFees }: Props) {
  return (
    <div className="enrolment-actions">
      <button className="dash-btn-secondary" onClick={onOpenBulkNotices}>
        <FileText size={15} /> Bulk EN Notices
      </button>
      <button className="dash-btn-secondary" onClick={onOpenReferToSupervisor}>
        <UserCheck size={15} /> Refer to Supervisor
      </button>
      <button className="dash-btn-primary" onClick={onOpenApproveCalculatedFees}>
        <CircleCheck size={15} /> Approve Calculated Fees
      </button>
    </div>
  );
}

