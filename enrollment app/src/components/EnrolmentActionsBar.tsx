import { FileText, UserCheck, CircleCheck, UserPlus, Pencil } from 'lucide-react';
import { useRole } from '../context/RoleContext';
import type { AppRole } from '../context/RoleContext';

const ASSIGN_ROLES: AppRole[] = ['SystemAdmin', 'Supervisor', 'ENAdmin'];
const BULK_EDIT_ROLES: AppRole[] = ['SystemAdmin'];
const REFER_ROLES: AppRole[] = ['SystemAdmin', 'Supervisor', 'ENAdmin', 'Verifier'];

type Props = {
  hasSelection: boolean;
  selectedCount: number;
  onOpenBulkNotices: () => void;
  onOpenBulkEdit: () => void;
  onOpenAssign: () => void;
  onOpenReferToSupervisor: () => void;
  onOpenApproveCalculatedFees: () => void;
};

export function EnrolmentActionsBar({ hasSelection, selectedCount, onOpenBulkNotices, onOpenBulkEdit, onOpenAssign, onOpenReferToSupervisor, onOpenApproveCalculatedFees }: Props) {
  const { activeRole } = useRole();
  const canAssign = ASSIGN_ROLES.includes(activeRole);
  const canBulkEdit = BULK_EDIT_ROLES.includes(activeRole);
  const canRefer = REFER_ROLES.includes(activeRole);

  return (
    <div className="enrolment-actions">
      {selectedCount > 0 && (
        <span className="enrolment-actions-selected-count">{selectedCount} selected</span>
      )}
      {canAssign && (
        <button className="dash-btn-secondary" onClick={onOpenBulkNotices} disabled={!hasSelection}>
          <FileText size={15} /> Bulk EN Notices
        </button>
      )}
      {canBulkEdit && (
        <button className="dash-btn-secondary" onClick={onOpenBulkEdit} disabled={!hasSelection}>
          <Pencil size={15} /> Bulk Edit
        </button>
      )}
      {canAssign && (
        <button className="dash-btn-secondary" onClick={onOpenAssign} disabled={!hasSelection}>
          <UserPlus size={15} /> Assign
        </button>
      )}
      {canRefer && (
        <button className="dash-btn-secondary" onClick={onOpenReferToSupervisor} disabled={!hasSelection}>
          <UserCheck size={15} /> Refer to Supervisor
        </button>
      )}
      {activeRole !== 'Verifier' && (
        <button className="dash-btn-primary" onClick={onOpenApproveCalculatedFees} disabled={!hasSelection}>
          <CircleCheck size={15} /> Approve Calculated Fees
        </button>
      )}
    </div>
  );
}
