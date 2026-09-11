import { type ReactNode } from 'react';

export type EnvironmentTone = 'dev' | 'test' | 'prod' | 'default';

interface EnvironmentBannerProps {
  title: string;
  environmentName?: string | null;
  userName?: string | null;
  tone?: EnvironmentTone;
  onOpenAppSwitcher?: () => void;
  brand?: ReactNode;
}

function getUserInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export function EnvironmentBanner({
  title,
  environmentName,
  userName,
  tone = 'default',
  onOpenAppSwitcher,
  brand,
}: EnvironmentBannerProps) {
  if (!environmentName) return null;

  const userInitials = userName ? getUserInitials(userName) : '';

  return (
    <header
      className="environment-banner"
      data-environment={tone}
      aria-label={`Environment: ${environmentName}`}
    >
      {onOpenAppSwitcher ? (
        <button
          type="button"
          className="environment-banner-trigger"
          onClick={onOpenAppSwitcher}
          aria-label="Open app switcher"
        >
          {brand}
          <span className="environment-banner-name">{title}</span>
        </button>
      ) : (
        <div className="environment-banner-trigger" role="presentation">
          {brand}
          <span className="environment-banner-name">{title}</span>
        </div>
      )}

      {userName && userInitials && (
        <span
          className="environment-banner-user"
          title={userName}
          aria-label={`Signed in as ${userName}`}
        >
          {userInitials}
        </span>
      )}
    </header>
  );
}
