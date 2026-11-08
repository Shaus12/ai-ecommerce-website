/**
 * Applies the schema and syncs the agent roster + default budgets into the
 * database. Idempotent: safe to run on every deploy. Editing an agent's
 * charter in code and re-running this updates it in place.
 */

import 'dotenv/config';
import { migrate, query, closeDb } from '../src/core/db.js';
import { ROSTER, validateRoster } from '../src/agents/registry.js';
import { MODEL_BY_TIER } from '../src/core/llm.js';

async function seedAgents(): Promise<void> {
  // Two passes: insert everyone first so reports_to foreign keys resolve.
  for (const a of ROSTER) {
    await query(
      `INSERT INTO agents (id, name, name_he, department, tier, model, effort, schedule_cron, enabled, config)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, name_he = EXCLUDED.name_he,
         department = EXCLUDED.department, tier = EXCLUDED.tier,
         model = EXCLUDED.model, effort = EXCLUDED.effort,
         schedule_cron = EXCLUDED.schedule_cron, config = EXCLUDED.config,
         updated_at = now()`,
      [
        a.id, a.name, a.nameHe, a.department, a.tier,
        MODEL_BY_TIER[a.modelTier], a.effort, a.schedule,
        a.enabled ?? true,
        JSON.stringify({
          charter: a.charter,
          objectives: a.objectives,
          tools: a.tools,
          canMessage: a.canMessage,
          modelTier: a.modelTier,
        }),
      ],
    );
  }
  for (const a of ROSTER) {
    await query(`UPDATE agents SET reports_to = $2 WHERE id = $1`, [a.id, a.reportsTo]);
  }
}

async function seedBudgets(): Promise<void> {
  const budgets: [string, string, number][] = [
    ['llm', 'הרצת הסוכנים', Number(process.env.LLM_BUDGET_USD ?? 250)],
    ['ads', 'תקציב פרסום', Number(process.env.ADS_BUDGET_USD ?? 0)],
    ['suppliers', 'הזמנות מספקים', 0],
    ['tools', 'כלים ומנויים', 0],
  ];
  for (const [id, label, limit] of budgets) {
    await query(
      `INSERT INTO budgets (id, label_he, limit_usd) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET label_he = EXCLUDED.label_he, updated_at = now()`,
      [id, label, limit],
    );
  }
}

async function main(): Promise<void> {
  const problems = validateRoster();
  if (problems.length) {
    console.error('Roster is invalid:\n' + problems.join('\n'));
    process.exit(1);
  }

  console.log('Applying schema…');
  await migrate();
  console.log('Syncing %d agents…', ROSTER.length);
  await seedAgents();
  await seedBudgets();

  const [{ count }] = await query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM agents`);
  console.log(`Done. ${count} agents on the roster.`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
