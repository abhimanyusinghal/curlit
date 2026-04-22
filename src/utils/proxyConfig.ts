export type ProxyMode = 'cloud' | 'local';

const STORAGE_KEY = 'curlit-proxy-mode';
const LOCAL_PROXY_HOST = 'localhost:3001';

export function getProxyMode(): ProxyMode {
  if (typeof window === 'undefined') return 'cloud';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'local' ? 'local' : 'cloud';
}

export function setProxyMode(mode: ProxyMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent('curlit-proxy-mode-change', { detail: mode }));
}

export function onProxyModeChange(cb: (mode: ProxyMode) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<ProxyMode>).detail);
  window.addEventListener('curlit-proxy-mode-change', handler);
  return () => window.removeEventListener('curlit-proxy-mode-change', handler);
}

export function proxyUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (getProxyMode() === 'local') {
    return `http://${LOCAL_PROXY_HOST}${normalized}`;
  }
  return normalized;
}

export function proxyWsUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (getProxyMode() === 'local') {
    return `ws://${LOCAL_PROXY_HOST}${normalized}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${normalized}`;
}

export function localProxyHealthUrl(): string {
  return `http://${LOCAL_PROXY_HOST}/api/health`;
}
