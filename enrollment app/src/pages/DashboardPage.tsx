const REPORT_ID = 'a14e5dfe-22ca-4974-a97b-844a5050fb64';
const GROUP_ID = 'b447b3b3-d200-43ee-b3cd-eabccd22a717';
const EMBED_URL = `https://app.powerbi.com/reportEmbed?reportId=${REPORT_ID}&groupId=${GROUP_ID}&autoAuth=true&ctid=6fdb5200-3d0d-4a8a-b036-d3685e359adc`;

export function DashboardPage() {
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
