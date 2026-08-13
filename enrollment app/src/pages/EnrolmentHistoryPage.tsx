import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { type Vsi_enrolmenthistories } from '../generated/models/Vsi_enrolmenthistoriesModel';
import { Vsi_enrolmenthistoriesService } from '../generated/services/Vsi_enrolmenthistoriesService';
import { getAvatarColor, getInitials } from '../utils/helpers';
import { formatDateOnlyForDisplay } from '../utils/date';

const formatCad = (value: number | undefined): string => {
  if (value == null || Number.isNaN(Number(value))) return '---';
  return `CA$${Number(value).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (value: string | undefined): string => {
  if (!value) return '---';
  const formatted = formatDateOnlyForDisplay(value, 'en-CA');
  return formatted || '---';
};

const yesNoText = (value: unknown): string => {
  if (value === true || value === 1 || value === '1') return 'Yes';
  if (value === false || value === 0 || value === '0') return 'No';
  return '---';
};

export function EnrolmentHistoryPage() {
  const { historyId, enrolmentId } = useParams<{ historyId: string; enrolmentId?: string }>();
  const navigate = useNavigate();

  const [record, setRecord] = useState<Vsi_enrolmenthistories | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!historyId) {
      setError('Missing history record ID.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await Vsi_enrolmenthistoriesService.get(historyId);
        if (cancelled) return;
        const loaded = result.data;
        if (!loaded) {
          setError('Unable to load enrolment history record.');
          return;
        }
        setRecord(loaded);
      } catch (e: unknown) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : 'Unable to load enrolment history record.';
          setError(`Unable to load enrolment history. ${message}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [historyId]);

  const backPath = enrolmentId ? `/enrolment/${enrolmentId}` : '/dashboard-home';
  const backLabel = enrolmentId ? 'Back to Enrolment' : 'Back to Enrolments';

  if (loading) {
    return <section className="details-wrapper"><p className="enrolment-loading">Loading history...</p></section>;
  }

  if (error || !record) {
    return (
      <section className="details-wrapper">
        <p className="enrolment-error">{error ?? 'Enrolment history record not found.'}</p>
        <button type="button" className="details-back-btn" onClick={() => navigate(backPath)}>{backLabel}</button>
      </section>
    );
  }

  const raw = record as unknown as Record<string, unknown>;
  const enrolmentName =
    (raw['vsi_participantprogramyearidname'] as string | undefined) ??
    (raw['_vsi_participantprogramyearid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined) ??
    '---';

  const feeModifiedBy =
    (record.vsi_feemodifiedbyname) ??
    (raw['_vsi_feemodifiedby_value@OData.Community.Display.V1.FormattedValue'] as string | undefined) ??
    '---';

  const ownerName =
    record.owneridname ||
    (raw['owneridname'] as string | undefined) ||
    (raw['_ownerid_value@OData.Community.Display.V1.FormattedValue'] as string | undefined) ||
    '';

  const margins: { label: string; value: number | undefined; used: boolean }[] = [
    { label: 'Program Year Margin 1', value: record.vsi_programyearmargin1, used: record.vsi_programyearmargin1used },
    { label: 'Program Year Margin 2', value: record.vsi_programyearmargin2, used: record.vsi_programyearmargin2used },
    { label: 'Program Year Margin 3', value: record.vsi_programyearmargin3, used: record.vsi_programyearmargin3used },
    { label: 'Program Year Margin 4', value: record.vsi_programyearmargin4, used: record.vsi_programyearmargin4used },
    { label: 'Program Year Margin 5', value: record.vsi_programyearmargin5, used: record.vsi_programyearmargin5used },
  ];

  return (
    <section className="details-wrapper">
      {/* Title Row */}
      <div className="details-title-row">
        <button type="button" className="details-back-btn" onClick={() => navigate(backPath)}>
          {backLabel}
        </button>
        <h1 className="details-page-title">Enrolment History</h1>
        <div className="details-meta-strip">
          <div className="details-info-card">
            <div className="details-info-stats-row">
              <div className="details-info-stat">
                <span className="details-info-value history-enrolment-name">{enrolmentName}</span>
                <span className="details-info-label">Enrolment</span>
              </div>
              <div className="details-info-stat-divider" />
              <div className="details-info-stat">
                <span className="details-info-value details-info-owner-value">
                  <span
                    className="avatar-circle"
                    style={{ background: getAvatarColor(ownerName), flexShrink: 0 }}
                    aria-hidden="true"
                  >
                    {getInitials(ownerName)}
                  </span>
                  {ownerName || '---'}
                </span>
                <span className="details-info-label">Owner</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main composite card */}
      <div className="details-composite">
        {/* Header band — general fields matching screenshot */}
        <div className="details-header-band">
          <div className="details-history-header-grid">
            <div className="details-field">
              <span className="details-label">Enrolment History Name <span className="required-mark">*</span></span>
              <strong className="details-value-strong">{record.vsi_name}</strong>
            </div>

            <div className="details-field">
              <span className="details-label">Fee Modified By</span>
              <strong className="details-value-strong">{feeModifiedBy || '---'}</strong>
            </div>

            <div className="details-field">
              <span className="details-label">Enrolment Fee <span className="required-mark">*</span></span>
              <strong className="details-money">{formatCad(record.vsi_enrolmentfee)}</strong>
            </div>

            <div className="details-field">
              <span className="details-label">Generated Date <span className="required-mark">*</span></span>
              <strong className="details-value-strong">{formatDate(record.vsi_generateddate)}</strong>
            </div>

            <div className="details-field">
              <span className="details-label">Generation Category</span>
              <strong className="details-value-strong">{record.new_generationcategory || '---'}</strong>
            </div>

            <div className="details-field">
              <span className="details-label">Generated from ENW Scenario</span>
              <strong className="details-value-strong">{yesNoText(record.vsi_generatedfromenwscenario)}</strong>
            </div>
          </div>
        </div>

        {/* Margins section */}
        <div className="details-section-break" />
        <div className="details-content-section details-content-fees">
          <h2 className="details-section-heading">Program Year Margins</h2>
          <div className="history-margins-list">
            {margins.map(m => (
              <div key={m.label} className="history-margin-row">
                <span className="details-label">{m.label}</span>
                <strong className={`details-money${m.used ? '' : ' details-money-inactive'}`}>
                  {m.value != null ? formatCad(m.value) : '---'}
                  {m.used ? <span className="history-margin-used-badge"> Used</span> : null}
                </strong>
              </div>
            ))}
          </div>          <div className="history-margin-row history-margin-total">
            <span className="details-label">Contribution Margin</span>
            <strong className="details-money">{formatCad(record.vsi_contributionmargin)}</strong>
          </div>        </div>
      </div>
    </section>
  );
}
