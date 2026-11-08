/**
 * The inter-agent message bus.
 *
 * Every word agents say to each other lands in one table and is fanned out
 * over Postgres LISTEN/NOTIFY — the dashboard subscribes to the same stream,
 * which is why you can watch the company talk in real time.
 */

import { EventEmitter } from 'node:events';
import pg from 'pg';
import { query, one } from './db.js';
import type { BusMessage, NewMessage } from './types.js';

export type BusEvent =
  | { type: 'message'; id: number; thread_id: string; from: string; to: string | null; kind: string }
  | { type: 'approval'; id: string; status: string; action: string }
  | { type: 'agent'; id: string; status: string; note: string | null }
  | { type: 'run'; id: string; agent: string; status: string }
  | { type: 'step'; runId: string; agent: string; step: unknown };

/** Process-local emitter. Everything interested in live activity listens here. */
export const bus = new EventEmitter<{ event: [BusEvent] }>();
bus.setMaxListeners(200);

let listener: pg.Client | null = null;

/** Opens the dedicated LISTEN connection. Reconnects on drop. */
export async function startBusListener(): Promise<void> {
  const client = new pg.Client({
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? 'aico',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE ?? 'aicompany',
  });

  client.on('notification', (msg) => {
    if (!msg.payload) return;
    try {
      bus.emit('event', JSON.parse(msg.payload) as BusEvent);
    } catch {
      /* malformed payload — ignore rather than kill the listener */
    }
  });

  client.on('error', () => {
    listener = null;
    setTimeout(() => void startBusListener(), 2_000);
  });

  await client.connect();
  await client.query('LISTEN bus');
  listener = client;
}

export async function stopBusListener(): Promise<void> {
  await listener?.end();
  listener = null;
}

/** Emit a local-only event (not persisted) — used for live step traces. */
export function emitLocal(event: BusEvent): void {
  bus.emit('event', event);
}

interface MessageRow {
  id: number;
  thread_id: string;
  from_agent: string;
  to_agent: string | null;
  department: string | null;
  kind: string;
  subject: string | null;
  body: string;
  payload: Record<string, unknown>;
  in_reply_to: number | null;
  read_at: Date | null;
  created_at: Date;
}

function toBusMessage(r: MessageRow): BusMessage {
  return {
    id: r.id,
    threadId: r.thread_id,
    from: r.from_agent,
    to: r.to_agent,
    department: r.department,
    kind: r.kind as BusMessage['kind'],
    subject: r.subject,
    body: r.body,
    payload: r.payload,
    inReplyTo: r.in_reply_to,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

export async function send(msg: NewMessage): Promise<BusMessage> {
  const row = await one<MessageRow>(
    `INSERT INTO messages
       (thread_id, from_agent, to_agent, department, kind, subject, body, payload, in_reply_to)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      msg.threadId ?? null,
      msg.from,
      msg.to ?? null,
      msg.department ?? null,
      msg.kind ?? 'chat',
      msg.subject ?? null,
      msg.body,
      JSON.stringify(msg.payload ?? {}),
      msg.inReplyTo ?? null,
    ],
  );
  return toBusMessage(row!);
}

/** Unread messages addressed to an agent (or broadcast to its department). */
export async function inbox(
  agentId: string,
  department: string,
  limit = 20,
): Promise<BusMessage[]> {
  const rows = await query<MessageRow>(
    `SELECT * FROM messages
      WHERE read_at IS NULL
        AND (to_agent = $1 OR (to_agent IS NULL AND department = $2))
        AND from_agent <> $1
      ORDER BY id ASC
      LIMIT $3`,
    [agentId, department, limit],
  );
  return rows.map(toBusMessage);
}

export async function markRead(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await query(`UPDATE messages SET read_at = now() WHERE id = ANY($1::bigint[])`, [ids]);
}

/** Most recent traffic, newest first — what the dashboard feed renders. */
export async function recent(limit = 100, before?: number): Promise<BusMessage[]> {
  const rows = before
    ? await query<MessageRow>(
        `SELECT * FROM messages WHERE id < $2 ORDER BY id DESC LIMIT $1`,
        [limit, before],
      )
    : await query<MessageRow>(`SELECT * FROM messages ORDER BY id DESC LIMIT $1`, [limit]);
  return rows.map(toBusMessage);
}

export async function thread(threadId: string): Promise<BusMessage[]> {
  const rows = await query<MessageRow>(
    `SELECT * FROM messages WHERE thread_id = $1 ORDER BY id ASC`,
    [threadId],
  );
  return rows.map(toBusMessage);
}
