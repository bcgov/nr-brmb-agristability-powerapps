import { BarChart2, ExternalLink } from 'lucide-react';

const REPORT_ID = 'a14e5dfe-22ca-4974-a97b-844a5050fb64';
const GROUP_ID = 'b447b3b3-d200-43ee-b3cd-eabccd22a717';
const TENANT_ID = '6fdb5200-3d0d-4a8a-b036-d3685e359adc';
const EMBED_URL = `https://app.powerbi.com/reportEmbed?reportId=${REPORT_ID}&groupId=${GROUP_ID}&autoAuth=true&ctid=${TENANT_ID}`;
const REPORT_URL = `https://app.powerbi.com/groups/${GROUP_ID}/reports/${REPORT_ID}`;

export function DashboardPage() {
  const isEmbeddedHost = typeof window !== 'undefined' && window.self !== window.top;

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
            href={REPORT_URL}
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
        src={EMBED_URL}
        style={{ flex: 1, minHeight: 0, border: 'none', borderRadius: '6px' }}
        allowFullScreen
      />
    </div>
  );
}

