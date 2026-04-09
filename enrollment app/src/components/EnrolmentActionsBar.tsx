type Props = {
  onOpenBulkNotices: () => void;
  onOpenReferToSupervisor: () => void;
  onOpenApproveCalculatedFees: () => void;
};

export function EnrolmentActionsBar({ onOpenBulkNotices, onOpenReferToSupervisor, onOpenApproveCalculatedFees }: Props) {
  return (
    <div className="enrolment-actions">
      <button className="btn-bulk" onClick={onOpenBulkNotices}>
        <span className="btn-bulk-icon">&#x1F5B6;</span> Bulk EN Notices
      </button>
      <button className="btn-bulk" onClick={onOpenReferToSupervisor}>
        <span className="btn-bulk-icon">&#x1F464;</span> Refer to Supervisor
      </button>
      <button className="btn-bulk" onClick={onOpenApproveCalculatedFees}>
        <span className="btn-bulk-icon">&#x2714;</span> Approve Calculated Fees
      </button>
    </div>
  );
}

