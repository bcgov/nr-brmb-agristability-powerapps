import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import type { Vsi_participantprogramyears } from '../generated/models/Vsi_participantprogramyearsModel';
import { Vsi_participantprogramyearsService } from '../generated/services/Vsi_participantprogramyearsService';
import { calculateVariance, formatCurrencyOr, formatVariancePercent, getTaskStatusLabel } from '../utils/helpers';

export function EnrolmentCalculationPage() {
  const { enrolmentId, source } = useParams<{ enrolmentId: string; source: string }>();
  const location = useLocation();
  const backTo = source === 'supervisor' ? '/supervisor-approval' : '/dashboard-home';
  const backLabel = source === 'supervisor' ? 'Back to Supervisor Approval' : 'Back to Dashboard';
  const [record, setRecord] = useState<Vsi_participantprogramyears | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enrolmentId) {
      setError('Missing enrolment id.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await Vsi_participantprogramyearsService.get(enrolmentId, {
          select: [
            'vsi_name',
            'vsi_taskstatus',
            'vsi_calculatedenfee',
            'vsi_previousyearcalculatedenfee',
            'modifiedon',
            'vsi_programyearidname',
            'vsi_participantidname',
          ],
        });
        if (!cancelled) setRecord(result.data ?? null);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enrolmentId]);

  const heading = useMemo(() => {
    if (!enrolmentId) return 'Enrolment Calculation';
    return `Enrolment Calculation: ${enrolmentId}`;
  }, [enrolmentId]);

  const variance = useMemo(() => {
    return calculateVariance(record?.vsi_calculatedenfee, record?.vsi_previousyearcalculatedenfee);
  }, [record?.vsi_calculatedenfee, record?.vsi_previousyearcalculatedenfee]);

  return (
    <section className="page-card calc-page">
      <h1>{heading}</h1>
      <p>Calculation screen placeholder. Detailed fee breakdown will be added here.</p>

      {loading && <p className="calc-state">Loading summary...</p>}
      {error && <p className="calc-state calc-state-error">Error loading summary: {error}</p>}

      {!loading && !error && record && (
        <div className="calc-summary-card" aria-label="Enrolment summary card">
          <h2 className="calc-summary-title">Summary</h2>
          <div className="calc-summary-grid">
            <div>
              <div className="calc-label">Enrolment Name</div>
              <div className="calc-value">{record.vsi_name || '-'}</div>
            </div>
            <div>
              <div className="calc-label">Task Status</div>
              <div className="calc-value">{getTaskStatusLabel(record.vsi_taskstatus) || '-'}</div>
            </div>
            <div>
              <div className="calc-label">Calculated Fee</div>
              <div className="calc-value">{formatCurrencyOr(record.vsi_calculatedenfee, '-')}</div>
            </div>
            <div>
              <div className="calc-label">Variance</div>
              <div className="calc-value">{formatVariancePercent(variance) || '-'}</div>
            </div>
          </div>
        </div>
      )}

      <div className="calc-links">
        <Link to={backTo}>{backLabel}</Link>
      </div>
      <div style={{ marginTop: 16, padding: 8, background: '#f1f5f9', borderRadius: 4, fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
        <strong>DEBUG</strong><br />
        pathname: {location.pathname}<br />
        source param: {source ?? '(undefined)'}<br />
        enrolmentId param: {enrolmentId ?? '(undefined)'}<br />
        backTo: {backTo}
      </div>
    </section>
  );
}
