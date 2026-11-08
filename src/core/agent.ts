/**
 * The agent runtime: one wake-up, one turn of work.
 *
 * An agent wakes on a schedule, on an incoming message, or on a task. It reads
 * its inbox, decides, uses tools (including messaging peers), and goes back to
 * sleep. Every step is traced so the dashboard can show it working.
 */

import Anthropic from '@anthropic-ai/sdk';
import { query, one } from './db.js';
import { callModel, costOf, assertBudget, recordSpend, BudgetExceededError, MODEL_BY_TIER, tierOf } from './llm.js';
import { inbox, markRead, emitLocal } from './bus.js';
import { recentMemory } from './memory.js';
import { toolsFor, dispatchTool } from './tools/index.js';
import { budgetState } from './guardrails.js';
import type { AgentStatus, ModelTier, RunStep } from './types.js';

const MAX_ITERATIONS = 12;

export interface AgentRecord {
  id: string;
  name: string;
  name_he: string;
  department: string;
  reports_to: string | null;
  tier: number;
  model: string;
  effort: string;
  enabled: boolean;
  status: string;
  config: {
    charter?: string;
    objectives?: string[];
    tools?: string[];
    canMessage?: string[];
  };
}

export async function loadAgent(id: string): Promise<AgentRecord | null> {
  return one<AgentRecord>(`SELECT * FROM agents WHERE id = $1`, [id]);
}

export async function setStatus(
  id: string,
  status: AgentStatus,
  note: string | null = null,
): Promise<void> {
  await query(
    `UPDATE agents SET status = $2, status_note = $3, updated_at = now() WHERE id = $1`,
    [id, status, note],
  );
  emitLocal({ type: 'agent', id, status, note });
}

/** Company-wide context every agent sees. Stable → cached across calls. */
async function companyBriefing(): Promise<string> {
  const roster = await query<{ id: string; name: string; department: string; charter: string }>(
    `SELECT id, name, department, COALESCE(config->>'charter','') AS charter
       FROM agents WHERE enabled ORDER BY tier, department, id`,
  );
  const lines = roster.map((r) => `- ${r.id} (${r.department}) — ${r.name}: ${r.charter.split('\n')[0] ?? ''}`);
  const market = process.env.TARGET_MARKET || 'not yet set';
  const currency = process.env.CURRENCY || 'USD';
  return `## The company\n\nYou work at ${process.env.COMPANY_NAME || 'a one-person e-commerce company'} run by a single human owner and a team of AI agents. The product line is ${process.env.PRODUCT_NAME || 'not yet set — ask the CEO agent if you need it'}. Customers are in ${market}; prices, ads and customer-facing copy are for that market, in ${currency}. The owner is Israeli and reads Hebrew; customers read English.\n\n## Who else works here\n\n${lines.join('\n')}`;
}

function buildSystem(
  agent: AgentRecord,
  briefing: string,
): Anthropic.Beta.BetaTextBlockParam[] {
  const cfg = agent.config ?? {};
  const objectives = (cfg.objectives ?? []).map((o) => `- ${o}`).join('\n');
  const canMessage = cfg.canMessage?.length ? cfg.canMessage.join(', ') : 'your department only';

  const charter = `You are **${agent.name}** (${agent.name_he}), the ${agent.department} department's ${agent.id} at this company.

${cfg.charter ?? ''}

## What you are accountable for
${objectives || '- (no objectives configured)'}

## How you work
- You wake up, do a bounded amount of real work, and stop. You are not in a conversation — you are on shift.
- Check your inbox first. Answer what was asked of you before starting anything new.
- Use \`recall\` before deciding anything you might have decided before.
- Delegate with \`message_agent\`. You may message: ${canMessage}. Report upward to: ${agent.reports_to ?? 'the owner'}.
- Record what you learn with \`remember\`, and any business number with \`record_kpi\`.
- You cannot spend money, publish publicly, place supplier orders, or sign anything. For those, use \`request_approval\` and move on — the owner clears it from a dashboard.
- Never invent numbers. If you do not have data, say so and ask the agent who owns it.
- Be concise. Your final message each shift is a short status the owner may read.

## Language
The owner reads Hebrew. Write \`report_to_owner\` and any \`title_he\` in Hebrew. Agent-to-agent messages may be in English.`;

  return [
    // Stable prefix — cached. Volatile state goes in the user turn instead.
    { type: 'text', text: briefing },
    { type: 'text', text: charter, cache_control: { type: 'ephemeral' } },
  ];
}

async function buildShiftPrompt(
  agent: AgentRecord,
  trigger: string,
): Promise<{ text: string; messageIds: number[] }> {
  const [messages, tasks, memory, budgets] = await Promise.all([
    inbox(agent.id, agent.department, 15),
    query<{ id: string; title: string; priority: number; status: string }>(
      `SELECT id, title, priority, status FROM tasks
        WHERE assigned_to = $1 AND status IN ('pending','running','blocked')
        ORDER BY priority, created_at LIMIT 10`,
      [agent.id],
    ),
    recentMemory(undefined, 6),
    budgetState(),
  ]);

  const parts: string[] = [`Shift start. Trigger: ${trigger}. Time: ${new Date().toISOString()}.`];

  parts.push(
    messages.length
      ? `## Your inbox (${messages.length} unread)\n` +
          messages
            .map((m) => `[#${m.id}] from ${m.from} — ${m.subject ?? '(no subject)'}\n${m.body}`)
            .join('\n\n')
      : '## Your inbox\nEmpty.',
  );

  parts.push(
    tasks.length
      ? `## Your open tasks\n` +
          tasks.map((t) => `- ${t.id} [p${t.priority}/${t.status}] ${t.title}`).join('\n')
      : '## Your open tasks\nNone.',
  );

  if (memory.length) {
    parts.push(
      `## Recent company memory\n` +
        memory.map((m) => `- [${m.namespace}] ${m.content}`).join('\n'),
    );
  }

  if (budgets.length) {
    parts.push(
      `## Budgets this period\n` +
        budgets
          .map((b) => `- ${b.id}: $${Number(b.spentUsd).toFixed(2)} of $${Number(b.limitUsd).toFixed(2)}`)
          .join('\n'),
    );
  }

  parts.push(
    `## Now\nDo the most valuable thing you can do in this shift, then stop and summarise it in one short paragraph.`,
  );

  return { text: parts.join('\n\n'), messageIds: messages.map((m) => m.id) };
}

export interface RunResult {
  runId: string;
  status: 'ok' | 'error' | 'skipped';
  summary: string;
  costUsd: number;
}

/** Runs one shift for one agent. Never throws — failures land in the run row. */
export async function runAgent(agentId: string, trigger = 'manual'): Promise<RunResult> {
  const agent = await loadAgent(agentId);
  if (!agent) return { runId: '', status: 'error', summary: `No such agent: ${agentId}`, costUsd: 0 };
  if (!agent.enabled) return { runId: '', status: 'skipped', summary: 'Agent disabled', costUsd: 0 };

  const runRow = await one<{ id: string }>(
    `INSERT INTO runs (agent_id, trigger, model) VALUES ($1,$2,$3) RETURNING id`,
    [agent.id, trigger, agent.model],
  );
  const runId = runRow!.id;
  const steps: RunStep[] = [];
  const pushStep = (s: RunStep) => {
    steps.push(s);
    emitLocal({ type: 'step', runId, agent: agent.id, step: s });
  };

  emitLocal({ type: 'run', id: runId, agent: agent.id, status: 'running' });

  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;

  try {
    await assertBudget();
    await setStatus(agent.id, 'thinking');

    const allowedTools = agent.config?.tools ?? [];
    const tools = toolsFor(allowedTools);
    const briefing = await companyBriefing();
    const system = buildSystem(agent, briefing);
    const shift = await buildShiftPrompt(agent, trigger);

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: 'user', content: shift.text },
    ];

    let finalText = '';

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await callModel({
        tier: tierOf(agent.model) as ModelTier,
        effort: (agent.effort as 'medium') ?? 'medium',
        system,
        messages,
        tools,
      });

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
      cacheRead += response.usage.cache_read_input_tokens ?? 0;
      costUsd += costOf(response.model, response.usage);

      if (response.stop_reason === 'refusal') {
        pushStep({ at: new Date().toISOString(), type: 'error', label: 'Model declined this request.' });
        finalText = 'Declined on safety grounds — escalating to the owner.';
        break;
      }

      // One step per summarised thought, not one per streamed fragment.
      for (const block of response.content) {
        if (block.type === 'thinking' && block.thinking.trim()) {
          pushStep({ at: new Date().toISOString(), type: 'thinking', label: block.thinking.slice(0, 600) });
        }
        if (block.type === 'text' && block.text.trim()) {
          finalText = block.text;
          pushStep({ at: new Date().toISOString(), type: 'text', label: block.text.slice(0, 600) });
        }
      }

      // A server tool (web search) ran out of turn budget — resume it.
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
      );
      if (!toolUses.length) break;

      await setStatus(agent.id, 'working');
      messages.push({ role: 'assistant', content: response.content });

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const use of toolUses) {
        pushStep({
          at: new Date().toISOString(),
          type: 'tool_use',
          label: use.name,
          detail: use.input,
        });
        const out = await dispatchTool(
          use.name,
          (use.input ?? {}) as Record<string, unknown>,
          { agentId: agent.id, runId, threadId: null },
          allowedTools,
        );
        pushStep({ at: new Date().toISOString(), type: 'tool_result', label: out.slice(0, 300) });
        results.push({ type: 'tool_result', tool_use_id: use.id, content: out });
      }
      messages.push({ role: 'user', content: results });
    }

    await markRead(shift.messageIds);
    await recordSpend(agent.id, { inputTokens, outputTokens, cacheRead, costUsd, model: agent.model }, `run ${runId}`);

    await query(
      `UPDATE runs SET status='ok', summary=$2, steps=$3, input_tokens=$4,
              output_tokens=$5, cache_read=$6, cost_usd=$7, finished_at=now()
        WHERE id=$1`,
      [runId, finalText.slice(0, 4000), JSON.stringify(steps), inputTokens, outputTokens, cacheRead, costUsd],
    );
    await query(`UPDATE agents SET last_run_at = now() WHERE id = $1`, [agent.id]);
    await setStatus(agent.id, 'idle', finalText.slice(0, 200) || null);
    emitLocal({ type: 'run', id: runId, agent: agent.id, status: 'ok' });

    return { runId, status: 'ok', summary: finalText, costUsd };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const blocked = err instanceof BudgetExceededError;

    await query(
      `UPDATE runs SET status='error', error=$2, steps=$3, cost_usd=$4, finished_at=now() WHERE id=$1`,
      [runId, message, JSON.stringify(steps), costUsd],
    );
    await setStatus(agent.id, blocked ? 'blocked' : 'error', message.slice(0, 200));
    emitLocal({ type: 'run', id: runId, agent: agent.id, status: 'error' });

    return { runId, status: 'error', summary: message, costUsd };
  }
}

export { MODEL_BY_TIER };
