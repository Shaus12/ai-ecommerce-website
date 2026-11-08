/**
 * Projects the monthly LLM bill from the live roster.
 *
 * Run this before changing an agent's cron or model tier — it walks every
 * minute of a day to count real shifts, and shows what prompt caching is
 * actually saving. Token counts are estimates; the spend_ledger is truth.
 */

import 'dotenv/config';
import { query, closeDb } from '../src/core/db.js';
import { ROSTER } from '../src/agents/registry.js';
import { cronMatches } from '../src/server/cron.js';
import type { ModelTier } from '../src/core/types.js';

function shiftsPerDay(cron: string | null): number {
  if (!cron) return 0;
  let n = 0;
  const d = new Date(2026, 8, 21); // a Monday, so weekly crons fire
  for (let m = 0; m < 1440; m++) {
    d.setHours(Math.floor(m / 60), m % 60, 0, 0);
    if (cronMatches(cron, d)) n++;
  }
  return n;
}

const PRICE: Record<ModelTier, { in: number; out: number; cacheRead: number }> = {
  deep: { in: 5, out: 25, cacheRead: 0.5 },
  standard: { in: 2, out: 10, cacheRead: 0.2 },
  fast: { in: 1, out: 5, cacheRead: 0.1 },
};

const OUT_TOKENS: Record<ModelTier, number> = { deep: 1400, standard: 900, fast: 400 };
const ITERATIONS: Record<ModelTier, number> = { deep: 3, standard: 2.5, fast: 1.5 };
const SHIFT_TOKENS = 700; // inbox + tasks + memory + budgets

async function main(): Promise<void> {
  const roster = await query<{ id: string; charter: string }>(
    `SELECT id, COALESCE(config->>'charter','') AS charter FROM agents WHERE enabled`,
  );
  const briefingChars =
    roster.map((r) => `- ${r.id} — ${r.charter.split('\n')[0] ?? ''}`).join('\n').length + 300;

  const totals: Partial<Record<ModelTier, { cached: number; uncached: number; shifts: number }>> = {};

  for (const a of ROSTER) {
    const p = PRICE[a.modelTier];
    const sysTokens = Math.round(
      (briefingChars + a.charter.length + a.objectives.join('').length + 900) / 3.6,
    );
    const out = OUT_TOKENS[a.modelTier];
    const iters = ITERATIONS[a.modelTier];

    const cached =
      (sysTokens * p.cacheRead + SHIFT_TOKENS * p.in * iters + out * p.out * iters) / 1e6;
    const uncached =
      (sysTokens * p.in * iters + SHIFT_TOKENS * p.in * iters + out * p.out * iters) / 1e6;

    const shifts = shiftsPerDay(a.schedule);
    const t = (totals[a.modelTier] ??= { cached: 0, uncached: 0, shifts: 0 });
    t.cached += cached * shifts;
    t.uncached += uncached * shifts;
    t.shifts += shifts;
  }

  console.log(`shared briefing ≈ ${Math.round(briefingChars / 3.6)} tokens, cached per agent\n`);
  console.log('tier        shifts/day    $/mo with cache    $/mo without');
  let gc = 0;
  let gu = 0;
  let gs = 0;
  for (const tier of ['deep', 'standard', 'fast'] as ModelTier[]) {
    const t = totals[tier];
    if (!t) continue;
    gc += t.cached * 30;
    gu += t.uncached * 30;
    gs += t.shifts;
    console.log(
      tier.padEnd(12) +
        String(t.shifts).padStart(6) +
        ('$' + (t.cached * 30).toFixed(2)).padStart(19) +
        ('$' + (t.uncached * 30).toFixed(2)).padStart(16),
    );
  }
  console.log('-'.repeat(58));
  console.log(
    'TOTAL       ' +
      String(gs).padStart(6) +
      ('$' + gc.toFixed(2)).padStart(19) +
      ('$' + gu.toFixed(2)).padStart(16),
  );
  console.log(
    `\nprompt caching saves $${(gu - gc).toFixed(2)}/mo (${Math.round((1 - gc / gu) * 100)}%)`,
  );
  console.log(`budget ceiling: $${process.env.LLM_BUDGET_USD ?? 250}`);

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
