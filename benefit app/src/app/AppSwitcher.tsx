import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { APP_ICONS, type EnvKey } from '../assets/iconAssets';
import { DEPLOY_ENV } from '../constants/deployEnvConfig';
import { Vsi_armsconfigurationsService } from '../generated/services/Vsi_armsconfigurationsService';

type AppType = 'code' | 'model' | 'canvas' | 'external';

interface AppTile {
  key: string;
  iconKey: keyof typeof APP_ICONS;
  label: string;
  type: AppType;
  isCurrent?: boolean;
  url: string | null;
}

const TYPE_LABEL: Record<AppType, string> = {
  code:     'CODE APP',
  model:    'UNIFIED INTERFACE',
  canvas:   'CANVAS',
  external: 'WEB APP',
};

// ── URL helpers (mirrors enrollment AppSwitcher) ─────────────────────────────
function normalizeOrgUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/main\.aspx.*$/i, '').replace(/\/?$/, '/');
}

function isActiveConfig(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const n = value.trim().toLowerCase();
    return n === 'true' || n === '1' || n === 'yes';
  }
  return false;
}

let dataverseOrgUrlCache: string | null = null;

async function resolveOrgUrl(): Promise<string | null> {
  if (dataverseOrgUrlCache) return dataverseOrgUrlCache;

  const result = await Vsi_armsconfigurationsService.getAll({
    maxPageSize: 50,
    select: ['vsi_activeconfiguration', 'vsi_coreenvironmenturl'],
    orderBy: ['modifiedon desc'],
  });
  const rows = result.data ?? [];
  const active = rows.find(r =>
    isActiveConfig((r as unknown as Record<string, unknown>).vsi_activeconfiguration) &&
    r.vsi_coreenvironmenturl?.trim()
  );
  const row = active ?? rows.find(r => r.vsi_coreenvironmenturl?.trim());
  const normalized = normalizeOrgUrl(row?.vsi_coreenvironmenturl);
  dataverseOrgUrlCache = normalized;
  return normalized;
}

async function resolveFarmsUrl(): Promise<string | null> {
  const result = await Vsi_armsconfigurationsService.getAll({
    maxPageSize: 50,
    orderBy: ['modifiedon desc'],
  });
  const rows = result.data ?? [];
  for (const row of rows) {
    const r = row as unknown as Record<string, unknown>;
    const url = (
      (typeof r['cr2a9_FARMSURLNEW'] === 'string' && r['cr2a9_FARMSURLNEW'].trim()) ||
      (typeof r['cr2a9_farmsurlnew'] === 'string' && r['cr2a9_farmsurlnew'].trim()) ||
      (typeof r['cr4dd_FARMSURLNEW'] === 'string' && r['cr4dd_FARMSURLNEW'].trim()) ||
      (typeof r['cr4dd_farmsurlnew'] === 'string' && r['cr4dd_farmsurlnew'].trim())
    ) || null;
    if (url) return url;
  }
  return null;
}

function resolveCanvasUrl(key: string): string | null {
  const ids = DEPLOY_ENV.canvasAppIds as Record<string, string>;
  const appId = ids[key];
  if (!appId) return null;
  return `https://apps.powerapps.com/play/e/${DEPLOY_ENV.environmentId}/a/${appId}?tenantId=${DEPLOY_ENV.tenantId}&hidenavbar=true`;
}

function buildInitialTiles(currentUrl: string): AppTile[] {
  return [
    { key: 'core-crm',          iconKey: 'core-crm',          label: DEPLOY_ENV.modelApps.find(a => a.key === 'core-crm')?.displayName ?? 'Core',    type: 'model',    url: null },
    { key: 'finance',           iconKey: 'finance',           label: DEPLOY_ENV.modelApps.find(a => a.key === 'finance')?.displayName ?? 'Finance', type: 'model',    url: null },
    // Enrolment App tile URL intentionally left blank until the app is published.
    { key: 'enrollment-app',    iconKey: 'enrollment-app',    label: 'Enrolment App',       type: 'code',     url: null },
    { key: 'benefit-app',       iconKey: 'benefit-app',       label: 'Benefit App',         type: 'code',     isCurrent: true, url: currentUrl },
    { key: 'change-management', iconKey: 'change-management', label: 'Change Management',   type: 'canvas',   url: resolveCanvasUrl('change-management') },
    { key: 'farms',             iconKey: 'farms',             label: 'FARMS',               type: 'external', url: null },
  ];
}

export function AppSwitcher({ onClose }: { onClose: () => void }) {
  const env: EnvKey = DEPLOY_ENV.stage;
  const [apps, setApps] = useState<AppTile[]>(() => buildInitialTiles(window.location.href));

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const orgUrl = await resolveOrgUrl().catch(() => null);
      if (!cancelled && orgUrl) {
        setApps(prev => prev.map(app => {
          const cfg = DEPLOY_ENV.modelApps.find(c => c.key === app.key);
          if (cfg) return { ...app, url: `${orgUrl}main.aspx?appid=${cfg.appModuleId}` };
          return app;
        }));
      }

      const farmsUrl = await resolveFarmsUrl().catch(() => null);
      if (!cancelled && farmsUrl) {
        setApps(prev => prev.map(app => (app.key === 'farms' ? { ...app, url: farmsUrl } : app)));
      }
    }

    void resolve();
    return () => { cancelled = true; };
  }, []);

  const handleClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  return (
    <div className="app-switcher-backdrop" onClick={handleClose} role="dialog" aria-modal="true" aria-label="App switcher">
      <div className="app-switcher-panel" onClick={event => event.stopPropagation()}>
        <div className="app-switcher-header">
          <h2 className="app-switcher-title">Apps</h2>
          <button type="button" className="app-switcher-close" onClick={handleClose} aria-label="Close app switcher">
            <X size={18} />
          </button>
        </div>

        <div className="app-switcher-grid">
          {apps.map(app => {
            const iconUrl = APP_ICONS[app.iconKey]?.[env];
            const card = (
              <div className={`app-card${app.isCurrent ? ' app-card--current' : ''}`}>
                <div className="app-card-icon-area">
                  {iconUrl
                    ? <img src={iconUrl} alt="" className="app-card-icon-img" />
                    : <span className="app-card-icon-mark">{app.label.slice(0, 2).toUpperCase()}</span>}
                </div>
                <div className="app-card-body">
                  <span className="app-card-name">{app.label}</span>
                  <span className={`app-card-badge app-card-badge--${app.type}`}>
                    {TYPE_LABEL[app.type]}
                  </span>
                </div>
              </div>
            );

            if (app.url && !app.isCurrent) {
              return (
                <a key={app.key} href={app.url} target="_blank" rel="noreferrer noopener" className="app-card-link" title={`Open ${app.label}`}>
                  {card}
                </a>
              );
            }

            return <div key={app.key} className="app-card-link">{card}</div>;
          })}
        </div>
      </div>
    </div>
  );
}
