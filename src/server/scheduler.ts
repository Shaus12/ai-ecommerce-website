/**
 * The heartbeat. Ticks once a minute and decides who works.
 *
 * Two triggers:
 *   schedule — the agent's cron fired
 *   message  — the agent has unread mail and is waiting on it
 *
 * Concurrency is capped so a burst of traffic cannot fan out into dozens of
 * simultaneous model calls and eat the month's budget in an hour.
 */

import { query, one } from '../core/db.js';
import { runAgent } from '../core/agent.js';
import { monthlyLlmSpend } from '../core/llm.js';
import { expireStaleApprovals } from '../core/guardrails.js';
import { cronMatches } from './cron.js';

const MAX_CONCURRENT = 3;

const running = new Set<string>();
let timer: NodeJS.Timeout | null = null;
let paused = false;

export function isPaused(): boolean {
  return paused;
}

export function setPaused(value: boolean): void {
  paused = value;
}

/** The owner's last pause/run decision, or null if they never made one. */
export async function loadPausedDecision(): Promise<boolean | null> {
  const row = await one<{ value: boolean }>(
    `SELECT value FROM company_state WHERE key = 'scheduler_paused'`,
  );
  return row ? Boolean(row.value) : null;
}

/** Records the owner's decision so it survives restarts. Budget auto-pauses do not call this. */
export async function persistPausedDecision(value: boolean): Promise<void> {
  await query(
    `INSERT INTO company_state (key, value) VALUES ('scheduler_paused', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(value)],
  );
}

interface DueAgent {
  id: string;
  schedule_cron: string | null;
  department: string;
}

/** Agents whose cron fires this minute. */
async function scheduledNow(now: Date): Promise<string[]> {
  const rows = await query<DueAgent>(
    `SELECT id, schedule_cron, department FROM agents
      WHERE enabled AND schedule_cron IS NOT NULL`,
  );
  return rows.filter((r) => cronMatches(r.schedule_cron!, now)).map((r) => r.id);
}

/**
 * Agents with unread mail. Scheduled agents wait for their next shift to read
 * peer mail (waking them twice wastes tokens), but a message from the owner
 * wakes anyone: the one human here should never wait for a cron.
 */
async function mailWaiting(): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `SELECT DISTINCT a.id
       FROM agents a
       JOIN messages m
         ON (m.to_agent = a.id OR (m.to_agent IS NULL AND m.department = a.department))
      WHERE a.enabled
        AND (a.schedule_cron IS NULL OR m.from_agent = 'human')
        AND m.read_at IS NULL
        AND m.from_agent <> a.id
        AND a.status NOT IN ('working', 'thinking')`,
  );
  return rows.map((r) => r.id);
}

async function dispatch(agentId: string, trigger: string): Promise<void> {
  if (running.has(agentId)) return;
  running.add(agentId);
  try {
    const result = await runAgent(agentId, trigger);
    if (result.status === 'error') {
      console.error(`[scheduler] ${agentId} failed: ${result.summary}`);
    }
  } catch (err) {
    console.error(`[scheduler] ${agentId} threw:`, err);
  } finally {
    running.delete(agentId);
  }
}

export async function tick(now = new Date()): Promise<void> {
  if (paused) return;

  await expireStaleApprovals();

  const limit = Number(process.env.LLM_BUDGET_USD ?? 250);
  if (limit > 0 && (await monthlyLlmSpend()) >= limit) {
    if (!paused) {
      console.warn('[scheduler] monthly LLM budget reached — pausing all agents');
      paused = true;
    }
    return;
  }

  const [scheduled, mail] = await Promise.all([scheduledNow(now), mailWaiting()]);

  // Scheduled work comes first; mail fills whatever capacity is left.
  const queue = [
    ...scheduled.map((id) => ({ id, trigger: 'schedule' })),
    ...mail.map((id) => ({ id, trigger: 'message' })),
  ];

  const seen = new Set<string>();
  for (const item of queue) {
    if (running.size >= MAX_CONCURRENT) break;
    if (seen.has(item.id) || running.has(item.id)) continue;
    seen.add(item.id);
    void dispatch(item.id, item.trigger);
  }
}

export function startScheduler(): void {
  if (timer) return;
  // Align to the top of the next minute so cron expressions fire on time.
  const msToNextMinute = 60_000 - (Date.now() % 60_000);
  setTimeout(() => {
    void tick();
    timer = setInterval(() => void tick(), 60_000);
  }, msToNextMinute);
  console.log('[scheduler] armed — first tick in %ds', Math.round(msToNextMinute / 1000));
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function runningAgents(): string[] {
  return [...running];
}
