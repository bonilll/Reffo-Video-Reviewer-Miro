export function publicBaseUrl(): string {
  const envUrl = (import.meta as any)?.env?.VITE_PUBLIC_SITE_URL as string | undefined;
  if (envUrl && typeof envUrl === 'string' && envUrl.startsWith('http')) return envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

