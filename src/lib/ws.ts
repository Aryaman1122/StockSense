import { API_URL, refreshSession } from './api';
import type { WsEvent } from './types';

/**
 * Connect to the backend's /ws and reconnect with backoff.
 * The handshake is authenticated by the access_token cookie; close code 4401 means it expired,
 * so refresh the session before reconnecting. Returns a disconnect function.
 */
export function connectWS(onEvent: (e: WsEvent) => void, onStatus: (connected: boolean) => void): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout>;

  const open = () => {
    ws = new WebSocket(API_URL.replace(/^http/, 'ws') + '/ws');
    ws.onopen = () => { attempt = 0; onStatus(true); };
    ws.onmessage = (m) => {
      try { onEvent(JSON.parse(m.data)); } catch { /* ignore non-JSON frames */ }
    };
    ws.onclose = async (e) => {
      onStatus(false);
      if (stopped) return;
      if (e.code === 4401) await refreshSession();
      timer = setTimeout(open, Math.min(30_000, 1000 * 2 ** attempt++));
    };
  };
  open();

  return () => { stopped = true; clearTimeout(timer); ws?.close(); };
}
