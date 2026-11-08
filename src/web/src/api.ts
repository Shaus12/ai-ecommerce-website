/** Typed client for the company API, plus the live websocket feed. */

export interface Agent {
  id: string;
  name: string;
  nameHe: string;
  department: string;
  reportsTo: string | null;
  tier: number;
  model: string;
  status: string;
  statusNote: string | null;
  scheduleCron: string | null;
  lastRunAt: string | null;
  enabled: boolean;
}

export interface Message {
  id: number;
  threadId: string;
  from: string;
  to: string | null;
  kind: string;
  subject: string | null;
  body: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  requestedBy: string;
  action: string;
  title: string;
  titleHe: string | null;
  rationale: string;
  amountUsd: number | null;
  risk: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  labelHe: string;
  limitUsd: number;
  spentUsd: number;
  hardStop: boolean;
}

export interface Kpi {
  metric: string;
  value: number;
  capturedAt: string;
}

export interface State {
  company: { name: string | null; product: string | null; autonomy: string };
  scheduler: { paused: boolean; running: string[] };
  agents: Agent[];
  budgets: Budget[];
  kpis: Kpi[];
  approvals: Approval[];
  llmSpendThisMonth: number;
}

export interface AgentDetail {
  agent: Agent & { effort: string; config: Record<string, unknown> };
  runs: Array<{
    id: string;
    trigger: string;
    status: string;
    summary: string | null;
    costUsd: number;
    startedAt: string;
    finishedAt: string | null;
    error: string | null;
  }>;
  spendThisMonth: number;
}

const TOKEN_KEY = 'aico.token';

export const getToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};

export const setToken = (t: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* private browsing — the token simply will not persist */
  }
};

export class Unauthorised extends Error {}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      // Fastify rejects a JSON content-type with no body, so only declare it
      // when we are actually sending one.
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) throw new Unauthorised('unauthorised');
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  state: () => req<State>('/api/state'),
  messages: (before?: number) =>
    req<Message[]>(`/api/messages?limit=80${before ? `&before=${before}` : ''}`),
  agent: (id: string) => req<AgentDetail>(`/api/agents/${id}`),
  runAgent: (id: string) => req<{ started: boolean }>(`/api/agents/${id}/run`, { method: 'POST' }),
  setEnabled: (id: string, enabled: boolean) =>
    req(`/api/agents/${id}/enabled`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  decide: (id: string, decision: 'approved' | 'rejected', note?: string) =>
    req(`/api/approvals/${id}`, { method: 'POST', body: JSON.stringify({ decision, note }) }),
  sendMessage: (to: string, body: string) =>
    req<Message>('/api/message', { method: 'POST', body: JSON.stringify({ to, body }) }),
  setPaused: (paused: boolean) =>
    req<{ paused: boolean }>('/api/scheduler', { method: 'POST', body: JSON.stringify({ paused }) }),
};

export type LiveEvent =
  | { type: 'hello'; at: string }
  | { type: 'message'; id: number; from: string; to: string | null; kind: string }
  | { type: 'approval'; id: string; status: string; action: string }
  | { type: 'agent'; id: string; status: string; note: string | null }
  | { type: 'run'; id: string; agent: string; status: string }
  | { type: 'step'; runId: string; agent: string; step: { type: string; label: string } };

/**
 * Opens the live feed and keeps it open, reconnecting with backoff.
 * Returns a teardown function.
 */
export function connectLive(
  onEvent: (e: LiveEvent) => void,
  onStatus: (connected: boolean) => void,
): () => void {
  let socket: WebSocket | null = null;
  let retry = 0;
  let closed = false;
  let timer: number | undefined;

  const open = () => {
    if (closed) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const token = getToken();
    socket = new WebSocket(
      `${proto}://${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`,
    );

    socket.onopen = () => {
      retry = 0;
      onStatus(true);
    };
    socket.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data as string) as LiveEvent);
      } catch {
        /* ignore malformed frame */
      }
    };
    socket.onclose = () => {
      onStatus(false);
      if (closed) return;
      retry = Math.min(retry + 1, 6);
      timer = window.setTimeout(open, 500 * 2 ** retry);
    };
    socket.onerror = () => socket?.close();
  };

  open();

  return () => {
    closed = true;
    if (timer) window.clearTimeout(timer);
    socket?.close();
  };
}
