/**
 * Authoritative API & Socket.IO URL Resolver for Muqabla 2026 Platform
 *
 * Supports cross-origin production deployment (Vercel Frontend -> Render Backend)
 * while preserving seamless relative proxying during local development.
 */

const RAW_API_URL = import.meta.env.VITE_API_URL || '';
const RAW_SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export function getApiBaseUrl(): string {
  if (RAW_API_URL) {
    return RAW_API_URL.replace(/\/+$/, '');
  }
  return '';
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export function getSocketUrl(): string {
  if (RAW_SOCKET_URL) {
    return RAW_SOCKET_URL.replace(/\/+$/, '');
  }
  if (RAW_API_URL) {
    return RAW_API_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:4000';
}
