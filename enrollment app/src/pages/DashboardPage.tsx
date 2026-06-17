import { ExternalLink } from 'lucide-react';

const REPORT_ID = 'a14e5dfe-22ca-4974-a97b-844a5050fb64';
const GROUP_ID = 'b447b3b3-d200-43ee-b3cd-eabccd22a717';
const TENANT_ID = '6fdb5200-3d0d-4a8a-b036-d3685e359adc';
const EMBED_URL = `https://app.powerbi.com/reportEmbed?reportId=${REPORT_ID}&groupId=${GROUP_ID}&autoAuth=true&ctid=${TENANT_ID}`;
const REPORT_URL = `https://app.powerbi.com/groups/${GROUP_ID}/reports/${REPORT_ID}`;

function OpenDashboardCard() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minHeight: 0,
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '1.25rem',
        textAlign: 'center',
        background: '#f8fafc',
      }}
    >
      <p style={{ margin: '0 0 0.75rem', color: '#2d3748' }}>
        Embedded Power BI is blocked in this host. Open the dashboard in a new tab.
      </p>
      <a
        href={REPORT_URL}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          background: '#2b6cb0',
          color: '#ffffff',
          textDecoration: 'none',
          padding: '0.55rem 0.85rem',
          borderRadius: '6px',
          fontWeight: 600,
        }}
      >
        <ExternalLink size={16} />
        Open Dashboard
      </a>
    </div>
  );
}

export function DashboardPage() {
  const isEmbeddedHost = typeof window !== 'undefined' && window.self !== window.top;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem', boxSizing: 'border-box' }}>
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem', fontWeight: 600, color: '#2d3748' }}>Dashboard</h2>
      {isEmbeddedHost ? (
        <OpenDashboardCard />
      ) : (
        <iframe
          title="Power BI Dashboard"
          src={EMBED_URL}
          style={{ flex: 1, minHeight: 0, border: 'none', borderRadius: '6px' }}
          allowFullScreen
        />
      )}
    </div>
  );
}
