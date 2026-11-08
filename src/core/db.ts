/** Postgres pool + tiny query helpers. One database, no other infrastructure. */

import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// Return NUMERIC as JS numbers rather than strings — every numeric column in
// this schema is money or a token count, well within float precision.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'aico',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE ?? 'aicompany',
  max: 12,
  idleTimeoutMillis: 30_000,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(sql, params as never[]);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Applies scripts/schema.sql. Idempotent — safe to run on every boot. */
export async function migrate(): Promise<void> {
  const candidates = [
    path.resolve(here, '../../scripts/schema.sql'),
    path.resolve(process.cwd(), 'scripts/schema.sql'),
  ];
  const file = candidates.find((p) => {
    try {
      readFileSync(p);
      return true;
    } catch {
      return false;
    }
  });
  if (!file) throw new Error('schema.sql not found');
  await pool.query(readFileSync(file, 'utf8'));
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
