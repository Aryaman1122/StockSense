import { mutate } from 'swr';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

type Init = Omit<RequestInit, 'body'> & { json?: unknown };

// One refresh in flight at a time: parallel 401s all wait on the same promise.
let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => r.ok, () => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

function messageOf(body: any, res: Response): string {
  if (typeof body?.message === 'string') return body.message; // DomainError: {error, message}
  if (Array.isArray(body?.detail)) // FastAPI validation: {detail: [{loc, msg}]}
    return body.detail.map((d: any) => `${d.loc?.slice(1).join('.') || 'body'}: ${d.msg}`).join('; ');
  if (typeof body?.detail === 'string') return body.detail;
  return `${res.status} ${res.statusText}`;
}

/** fetch wrapper: sends auth cookies, JSON in/out, refreshes the access token once on 401. */
export async function api<T>(path: string, init: Init = {}, retry = true): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      credentials: 'include',
      ...rest,
      headers: { ...(json !== undefined && { 'Content-Type': 'application/json' }), ...headers },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', `Cannot reach the API at ${API_URL}`);
  }
  if (res.status === 401 && retry && path !== '/auth/login' && path !== '/auth/refresh') {
    if (await refreshSession()) return api<T>(path, init, false);
    window.dispatchEvent(new Event('auth:expired'));
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? 'http_error', messageOf(body, res));
  return body as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);

/** Build "/path?a=1&b=2", dropping empty values. */
export function qs(path: string, params: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) p.set(k, String(v));
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

/** Revalidate every cached inventory query (after a write, or on a WebSocket event). */
export const revalidateAll = () => mutate((key) => typeof key === 'string' && !key.startsWith('/auth'));
