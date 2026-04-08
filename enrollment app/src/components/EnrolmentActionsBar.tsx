type Props = {
  onOpenBulkNotices: () => void;
};

export function EnrolmentActionsBar({ onOpenBulkNotices }: Props) {
  return (
    <div className="enrolment-actions">
      <button className="btn-bulk" onClick={onOpenBulkNotices}>
        <span className="btn-bulk-icon">&#x1F5B6;</span> Bulk EN Notices
      </button>
    </div>
  );
}

