/**
 * Shared company memory.
 *
 * Agents write facts, lessons and decisions here; every other agent can read
 * them. Retrieval is Postgres full-text + recency — no embedding provider is
 * wired up, so the `embedding` column stays NULL until one is (see docs).
 */

import { query, one } from './db.js';
import type { MemoryEntry } from './types.js';

interface MemoryRow {
  id: string;
  namespace: string;
  key: string | null;
  content: string;
  metadata: Record<string, unknown>;
  author: string;
  confidence: number;
  created_at: Date;
}

const toEntry = (r: MemoryRow): MemoryEntry => ({
  id: r.id,
  namespace: r.namespace,
  key: r.key,
  content: r.content,
  metadata: r.metadata,
  author: r.author,
  confidence: r.confidence,
  createdAt: r.created_at,
});

export interface RememberInput {
  namespace: string;
  content: string;
  key?: string | null;
  author: string;
  metadata?: Record<string, unknown>;
  confidence?: number;
  ttlDays?: number;
}

/** Writes a fact. A repeated `key` in the same namespace overwrites. */
export async function remember(input: RememberInput): Promise<MemoryEntry> {
  const expires = input.ttlDays
    ? new Date(Date.now() + input.ttlDays * 86_400_000)
    : null;

  const row = await one<MemoryRow>(
    `INSERT INTO memory (namespace, key, content, metadata, author, confidence, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (namespace, key) WHERE key IS NOT NULL
     DO UPDATE SET content = EXCLUDED.content,
                   metadata = EXCLUDED.metadata,
                   author = EXCLUDED.author,
                   confidence = EXCLUDED.confidence,
                   created_at = now()
     RETURNING *`,
    [
      input.namespace,
      input.key ?? null,
      input.content,
      JSON.stringify(input.metadata ?? {}),
      input.author,
      input.confidence ?? 1.0,
      expires,
    ],
  );
  return toEntry(row!);
}

export async function recall(
  q: string,
  opts: { namespace?: string; limit?: number } = {},
): Promise<MemoryEntry[]> {
  const limit = opts.limit ?? 8;
  const terms = q.trim().split(/\s+/).filter(Boolean).join(' | ');
  if (!terms) return recentMemory(opts.namespace, limit);

  const rows = await query<MemoryRow>(
    `SELECT *, ts_rank(to_tsvector('simple', content), to_tsquery('simple', $1)) AS rank
       FROM memory
      WHERE (expires_at IS NULL OR expires_at > now())
        AND ($2::text IS NULL OR namespace = $2)
        AND to_tsvector('simple', content) @@ to_tsquery('simple', $1)
      ORDER BY rank DESC, created_at DESC
      LIMIT $3`,
    [terms, opts.namespace ?? null, limit],
  );
  return rows.map(toEntry);
}

export async function recentMemory(
  namespace?: string,
  limit = 8,
): Promise<MemoryEntry[]> {
  const rows = await query<MemoryRow>(
    `SELECT * FROM memory
      WHERE (expires_at IS NULL OR expires_at > now())
        AND ($1::text IS NULL OR namespace = $1)
      ORDER BY created_at DESC LIMIT $2`,
    [namespace ?? null, limit],
  );
  return rows.map(toEntry);
}

export async function forget(id: string): Promise<void> {
  await query(`DELETE FROM memory WHERE id = $1`, [id]);
}
