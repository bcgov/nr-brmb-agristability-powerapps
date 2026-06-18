import { Calculator, ExternalLink } from 'lucide-react';
import type { Vsi_participantprogramyearsvsi_enrolmentstatus as EnrolmentStatusValue } from '../generated/models/Vsi_participantprogramyearsModel';
import type { CombinedFarmSummary, PartnerComparisonRow } from '../services/enrolmentPartners';

type StatusOption = {
  value: EnrolmentStatusValue;
  label: string;
};

type Props = {
  rows: PartnerComparisonRow[];
  combinedFarm: CombinedFarmSummary | null;
  loading: boolean;
  error: string | null;
  navigationError: string | null;
  openingPartnerKey: string | null;
  enrolmentProgramYear: number | null;
  statusOptions: StatusOption[];
  saving: boolean;
  canEdit: boolean;
  formatCurrency: (value: unknown) => string;
  onOpenAccount: (row: PartnerComparisonRow) => void;
  onOpenEnrolment: (row: PartnerComparisonRow, target: 'details' | 'calculation') => void;
  onStatusChange: (partnerEnrolmentId: string, value: EnrolmentStatusValue) => void;
  onPaidDateChange: (partnerEnrolmentId: string, value: string) => void;
};

export function EnrolmentPartnersPanel({
  rows,
  combinedFarm,
  loading,
  error,
  navigationError,
  openingPartnerKey,
  enrolmentProgramYear,
  statusOptions,
  saving,
  canEdit,
  formatCurrency,
  onOpenAccount,
  onOpenEnrolment,
  onStatusChange,
  onPaidDateChange,
}: Props) {
  return (
    <div className="details-content-section">
      <h3 className="details-subsection-title">Partnerships &amp; Combined Partners</h3>
      {loading && <p className="details-partner-state">Loading partners...</p>}
      {error && <p className="details-partner-state details-partner-state-error">{error}</p>}
      {navigationError && <p className="details-partner-state details-partner-state-error">{navigationError}</p>}

      {!loading && !error && combinedFarm && (
        <div className="details-combined-farm">
          <h4 className="details-combined-farm-heading">Combined farm</h4>
          <div className="details-combined-farm-grid">
            <div>
              <span className="details-label">PIN</span>
              <strong className="details-value-strong">{combinedFarm.participantPin || '---'}</strong>
            </div>
            <div>
              <span className="details-label">Combined Farm Number</span>
              <strong className="details-value-strong">{combinedFarm.combinedFarmNumber || '---'}</strong>
            </div>
            <div>
              <span className="details-label">Scenario</span>
              <strong className="details-value-strong">{combinedFarm.scenarioNumber || '---'}</strong>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="details-partner-list">
          {rows.map((row, index) => {
            const displayName = [row.firstName, row.lastName].filter(Boolean).join(' ')
              || row.partnershipName
              || '---';
            const partnerPin = row.partnerParticipantPin;
            const partnerControlKey = row.partnerEnrolmentId || `${partnerPin}-${index}`;
            const accountLoading = openingPartnerKey === `account:${partnerPin}`;
            const detailsLoading = openingPartnerKey === `details:${partnerPin}`;
            const calculationLoading = openingPartnerKey === `calculation:${partnerPin}`;

            return (
              <article
                className="details-partner-card"
                key={`${row.operation}-${partnerPin}-${row.firstName}-${row.lastName}`}
              >
                <div className="details-partner-card-top">
                  <button
                    type="button"
                    className="details-partner-title-link"
                    onClick={() => onOpenAccount(row)}
                    disabled={!partnerPin || accountLoading}
                    title={partnerPin ? `Open CORE account for PIN ${partnerPin}` : 'Partner PIN is unavailable'}
                  >
                    {accountLoading ? 'Opening...' : displayName}
                  </button>
                  <button
                    type="button"
                    className="details-partner-enrolment-link"
                    onClick={() => onOpenEnrolment(row, 'details')}
                    disabled={!partnerPin || !enrolmentProgramYear || detailsLoading}
                  >
                    {detailsLoading
                      ? 'Opening...'
                      : `${enrolmentProgramYear ?? ''} ENROLMENT ${partnerPin}`.trim()}
                  </button>
                </div>

                <div className="details-partner-summary-grid">
                  <div>
                    <label className="details-label" htmlFor={`partner-status-${partnerControlKey}`}>
                      Enrolment Status
                    </label>
                    <select
                      id={`partner-status-${partnerControlKey}`}
                      className="details-select details-partner-control"
                      value={row.enrolmentStatus ?? ''}
                      onChange={event => onStatusChange(
                        row.partnerEnrolmentId,
                        Number(event.target.value) as EnrolmentStatusValue,
                      )}
                      disabled={saving || !canEdit || !row.partnerEnrolmentId}
                    >
                      {row.enrolmentStatus == null && <option value="" />}
                      {statusOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="details-label">Calculated Fee</span>
                    <strong className="details-money">{formatCurrency(row.enrolmentFee)}</strong>
                  </div>
                  <div>
                    <label className="details-label" htmlFor={`partner-paid-date-${partnerControlKey}`}>
                      Enrolment Fees Paid Date
                    </label>
                    <input
                      id={`partner-paid-date-${partnerControlKey}`}
                      type="date"
                      className="details-date details-partner-control"
                      value={row.enrolmentFeesPaidDate}
                      onChange={event => onPaidDateChange(row.partnerEnrolmentId, event.target.value)}
                      disabled={saving || !canEdit || !row.partnerEnrolmentId}
                    />
                  </div>
                  <div>
                    <span className="details-label">Percent</span>
                    <strong className="details-value-strong">{row.partnerPercent || '---'}</strong>
                  </div>
                  <div>
                    <span className="details-label">Operation</span>
                    <strong className="details-value-strong">{row.operation || '---'}</strong>
                  </div>
                  <div className="details-partner-calculation">
                    <button
                      type="button"
                      className="details-partner-calculation-btn"
                      onClick={() => onOpenEnrolment(row, 'calculation')}
                      disabled={!partnerPin || !enrolmentProgramYear || calculationLoading}
                      title="Open partner calculation"
                      aria-label={`Open calculation for PIN ${partnerPin}`}
                    >
                      {calculationLoading
                        ? <ExternalLink size={16} aria-hidden="true" />
                        : <Calculator size={16} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && !error && rows.length === 0 && !combinedFarm && (
        <p className="details-subsection-empty">No partner or combined farm data found.</p>
      )}
    </div>
  );
}
