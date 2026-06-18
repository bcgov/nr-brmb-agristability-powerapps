import { useEffect, useState } from 'react';
import { BarChart2, ExternalLink } from 'lucide-react';
import { Vsi_armsconfigurationsService } from '../generated/services/Vsi_armsconfigurationsService';

type DashboardConfig = {
  reportUrl: string;
  embedUrl: string;
};

function normalizeRequired(value: string | null | undefined, fieldName: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required core configuration value: ${fieldName}`);
  }
  return normalized;
}

async function loadDashboardConfig(): Promise<DashboardConfig> {
  const result = await Vsi_armsconfigurationsService.getAll({
    maxPageSize: 50,
    select: [
      'vsi_activeconfiguration',
      'vsi_tenantid',
      'vsi_powerbireportgroupid',
      'vsi_powerbiendashboardreportid',
    ],
  });

  const rows = result.data ?? [];
  const activeRow = rows.find(row => row.vsi_activeconfiguration === true);
  if (!activeRow) {
    throw new Error('No active core configuration record found.');
  }

  const tenantId = normalizeRequired(activeRow.vsi_tenantid, 'vsi_tenantid');
  const groupId = normalizeRequired(activeRow.vsi_powerbireportgroupid, 'vsi_powerbireportgroupid');
  const reportId = normalizeRequired(activeRow.vsi_powerbiendashboardreportid, 'vsi_powerbiendashboardreportid');

  return {
    reportUrl: `https://app.powerbi.com/groups/${groupId}/reports/${reportId}`,
    embedUrl: `https://app.powerbi.com/reportEmbed?reportId=${reportId}&groupId=${groupId}&autoAuth=true&ctid=${tenantId}`,
  };
}

export function DashboardPage() {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isEmbeddedHost = typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const loadedConfig = await loadDashboardConfig();
        if (!cancelled) setConfig(loadedConfig);
      } catch (e: unknown) {
        if (!cancelled) {
          setConfig(null);
          setError(e instanceof Error ? e.message : 'Unable to load dashboard configuration.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const contentMessage = loading
    ? 'Loading dashboard configuration...'
    : error || 'Unable to load dashboard configuration.';

  if (loading || error || !config) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '2rem 2.5rem',
          textAlign: 'center',
          maxWidth: '520px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
        }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 700, color: '#2d3748' }}>
            Dashboard Configuration
          </h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#4b5563', lineHeight: 1.5 }}>
            {contentMessage}
          </p>
        </div>
      </div>
    );
  }

  if (isEmbeddedHost) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '2.5rem 3rem',
          textAlign: 'center',
          maxWidth: '400px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <div style={{ background: '#ebf4ff', borderRadius: '50%', padding: '1rem', display: 'flex' }}>
              <BarChart2 size={32} color="#2b6cb0" />
            </div>
          </div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontWeight: 700, color: '#2d3748' }}>
            Agristability Dashboard
          </h2>
          <p style={{ margin: '0 0 1.5rem', fontSize: '0.88rem', color: '#718096', lineHeight: 1.5 }}>
            View enrolment analytics and reporting in Power BI.
          </p>
          <a
            href={config.reportUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: '#2b6cb0',
              color: '#fff',
              textDecoration: 'none',
              padding: '0.6rem 1.25rem',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            <ExternalLink size={15} />
            Open in Power BI
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem', boxSizing: 'border-box' }}>
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 600, color: '#2d3748' }}>Dashboard</h2>
      <iframe
        title="Power BI Dashboard"
        src={config.embedUrl}
        style={{ flex: 1, minHeight: 0, border: 'none', borderRadius: '6px' }}
        allowFullScreen
      />
    </div>
  );
}

