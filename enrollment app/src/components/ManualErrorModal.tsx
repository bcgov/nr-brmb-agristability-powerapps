import React from 'react';

type ManualErrorModalProps = {
  message: string;
  onClose: () => void;
};

const ManualErrorModal: React.FC<ManualErrorModalProps> = ({ message, onClose }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-box" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <h3>Cannot Set Selected Enrolments to Manual</h3>
        <button className="modal-close" onClick={onClose}>&times;</button>
      </div>
      <div className="modal-body">
        <div className="no-selection-message">{message}</div>
      </div>
      <div className="modal-footer">
        <button className="btn-ok" onClick={onClose}>OK</button>
      </div>
    </div>
  </div>
);

export default ManualErrorModal;
