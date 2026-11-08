/**
 * The tool surface every agent shares.
 *
 * Each agent definition lists the subset it may call; anything outside that
 * list is refused at dispatch, so a support agent can never touch ad spend.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ToolContext, ToolDefinition } from '../types.js';
import { send } from '../bus.js';
import { remember, recall } from '../memory.js';
import { query, one } from '../db.js';
import { requestApproval, needsApproval, budgetAllows } from '../guardrails.js';

const registry = new Map<string, ToolDefinition>();

export function registerTool(def: ToolDefinition): void {
  registry.set(def.name, def);
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

/** Builds the API tool list for the names an agent is allowed to use. */
export function toolsFor(names: string[]): Anthropic.Beta.BetaToolUnion[] {
  const out: Anthropic.Beta.BetaToolUnion[] = [];
  for (const name of names) {
    if (name === 'web_search') {
      out.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 8 });
      continue;
    }
    const def = registry.get(name);
    if (!def) continue;
    out.push({
      name: def.name,
      description: def.description,
      input_schema: def.inputSchema as Anthropic.Beta.BetaTool['input_schema'],
    });
  }
  return out;
}

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
  allowed: string[],
): Promise<string> {
  if (!allowed.includes(name)) {
    return `DENIED: agent "${ctx.agentId}" is not authorised to use the tool "${name}".`;
  }
  const def = registry.get(name);
  if (!def) return `ERROR: unknown tool "${name}".`;
  try {
    return await def.run(input, ctx);
  } catch (err) {
    return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

// ------------------------------------------------------------ talk to peers

registerTool({
  name: 'message_agent',
  description:
    'Send a message to another agent in the company and continue working. ' +
    'Use this to delegate, ask for data, or report a result upward. ' +
    'The recipient will pick it up on its next cycle — this is not a blocking call.',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient agent id, e.g. "cfo" or "media-buyer".' },
      subject: { type: 'string', description: 'One-line subject.' },
      body: { type: 'string', description: 'The message. Be specific and include numbers.' },
      kind: {
        type: 'string',
        enum: ['chat', 'request', 'response', 'decision', 'alert', 'report'],
        description: 'request = you need something back; report = FYI upward.',
      },
    },
    required: ['to', 'subject', 'body'],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const to = str(input.to);
    const exists = await one<{ id: string }>(`SELECT id FROM agents WHERE id = $1`, [to]);
    if (!exists) return `ERROR: no agent with id "${to}". Use list_agents first.`;
    const msg = await send({
      from: ctx.agentId,
      to,
      threadId: ctx.threadId ?? undefined,
      kind: (str(input.kind, 'chat') as 'chat'),
      subject: str(input.subject),
      body: str(input.body),
    });
    return `Sent to ${to} (message #${msg.id}).`;
  },
});

registerTool({
  name: 'list_agents',
  description: 'List the agents in the company with their department and current status.',
  inputSchema: {
    type: 'object',
    properties: {
      department: { type: 'string', description: 'Optional filter.' },
    },
    additionalProperties: false,
  },
  async run(input) {
    const dept = str(input.department) || null;
    const rows = await query<{ id: string; name: string; department: string; status: string }>(
      `SELECT id, name, department, status FROM agents
        WHERE enabled AND ($1::text IS NULL OR department = $1)
        ORDER BY tier, department, id`,
      [dept],
    );
    if (!rows.length) return 'No agents found.';
    return rows.map((r) => `${r.id} — ${r.name} [${r.department}] (${r.status})`).join('\n');
  },
});

// ---------------------------------------------------------------- memory

registerTool({
  name: 'remember',
  description:
    'Write a durable fact, lesson or decision to company memory so other agents ' +
    'and your future self can use it. Prefer one clear fact per call.',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'Bucket, e.g. "product", "customer", "creative", "lesson", "supplier".',
      },
      key: { type: 'string', description: 'Optional stable key — re-using it overwrites.' },
      content: { type: 'string', description: 'The fact itself, stated plainly.' },
      confidence: { type: 'number', description: '0..1 — how sure you are.' },
    },
    required: ['namespace', 'content'],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const entry = await remember({
      namespace: str(input.namespace, 'general'),
      key: str(input.key) || null,
      content: str(input.content),
      author: ctx.agentId,
      confidence: num(input.confidence) ?? 1,
    });
    return `Stored in memory (${entry.namespace}).`;
  },
});

registerTool({
  name: 'recall',
  description: 'Search company memory before making a decision, so you do not repeat past work.',
  inputSchema: {
    type: 'object',
    properties: {
      q: { type: 'string', description: 'Search terms.' },
      namespace: { type: 'string' },
      limit: { type: 'number' },
    },
    required: ['q'],
    additionalProperties: false,
  },
  async run(input) {
    const rows = await recall(str(input.q), {
      namespace: str(input.namespace) || undefined,
      limit: num(input.limit) ?? 8,
    });
    if (!rows.length) return 'Nothing in memory matches that.';
    return rows
      .map((r) => `[${r.namespace}] ${r.content} — ${r.author}, ${r.createdAt.toISOString().slice(0, 10)}`)
      .join('\n');
  },
});

// ----------------------------------------------------------------- tasks

registerTool({
  name: 'create_task',
  description: 'Create a tracked unit of work, optionally assigned to another agent.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      assigned_to: { type: 'string', description: 'Agent id, or omit to leave unassigned.' },
      priority: { type: 'number', description: '1 highest .. 9 lowest. Default 5.' },
    },
    required: ['title'],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const row = await one<{ id: string }>(
      `INSERT INTO tasks (title, description, assigned_to, created_by, priority)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [
        str(input.title),
        str(input.description),
        str(input.assigned_to) || null,
        ctx.agentId,
        num(input.priority) ?? 5,
      ],
    );
    return `Task created (${row!.id}).`;
  },
});

registerTool({
  name: 'my_tasks',
  description: 'List the open tasks assigned to you, highest priority first.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run(_input, ctx) {
    const rows = await query<{ id: string; title: string; status: string; priority: number }>(
      `SELECT id, title, status, priority FROM tasks
        WHERE assigned_to = $1 AND status IN ('pending','running','blocked')
        ORDER BY priority, created_at LIMIT 20`,
      [ctx.agentId],
    );
    if (!rows.length) return 'No open tasks assigned to you.';
    return rows.map((r) => `${r.id} [p${r.priority}/${r.status}] ${r.title}`).join('\n');
  },
});

registerTool({
  name: 'complete_task',
  description: 'Mark one of your tasks done (or failed) with a short result.',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string' },
      outcome: { type: 'string', enum: ['done', 'failed'] },
      summary: { type: 'string', description: 'What actually happened.' },
    },
    required: ['task_id', 'outcome', 'summary'],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const rows = await query(
      `UPDATE tasks SET status = $2, finished_at = now(),
              result = jsonb_build_object('summary', $3::text)
        WHERE id = $1 AND assigned_to = $4 RETURNING id`,
      [str(input.task_id), str(input.outcome), str(input.summary), ctx.agentId],
    );
    return rows.length ? 'Task closed.' : 'ERROR: task not found or not assigned to you.';
  },
});

// ------------------------------------------------------- human & metrics

registerTool({
  name: 'request_approval',
  description:
    'Ask the owner to approve an action you cannot take alone: spending money, ' +
    'publishing publicly, placing a supplier order, or anything legally binding. ' +
    'State the cost and the reasoning — the owner decides from one screen.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['spend', 'publish', 'order', 'legal', 'other'] },
      title: { type: 'string', description: 'Short English title.' },
      title_he: { type: 'string', description: 'Same title in Hebrew — the dashboard is Hebrew.' },
      rationale: { type: 'string', description: 'Why this is worth doing, with numbers.' },
      amount_usd: { type: 'number' },
      risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
    required: ['action', 'title', 'rationale'],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const action = str(input.action, 'other') as 'spend';
    const amount = num(input.amount_usd) ?? 0;

    if (amount > 0 && !(await budgetAllows('ads', amount))) {
      return `BLOCKED: this would exceed the ads budget ceiling. Raise the budget first or reduce the amount.`;
    }
    if (!needsApproval(action, amount)) {
      return 'No approval needed under the current autonomy settings — go ahead and do it.';
    }
    const a = await requestApproval({
      requestedBy: ctx.agentId,
      action,
      title: str(input.title),
      titleHe: str(input.title_he) || undefined,
      rationale: str(input.rationale),
      amountUsd: amount || undefined,
      risk: (str(input.risk, 'medium') as 'medium'),
    });
    return `Approval #${a.id} is waiting for the owner. Do not act until it is approved; pick this up on a later cycle.`;
  },
});

registerTool({
  name: 'report_to_owner',
  description:
    'Send a short note straight to the owner. Reserve this for things that ' +
    'genuinely need a human: a real problem, a decision only they can make, ' +
    'or a result worth knowing today. Routine work does not belong here.',
  inputSchema: {
    type: 'object',
    properties: {
      subject: { type: 'string' },
      body: { type: 'string', description: 'Write in Hebrew. Lead with the point.' },
      urgency: { type: 'string', enum: ['normal', 'high'] },
    },
    required: ['subject', 'body'],
    additionalProperties: false,
  },
  async run(input, ctx) {
    await send({
      from: ctx.agentId,
      to: 'human',
      kind: str(input.urgency) === 'high' ? 'alert' : 'report',
      subject: str(input.subject),
      body: str(input.body),
    });
    return 'Delivered to the owner inbox.';
  },
});

registerTool({
  name: 'record_kpi',
  description: 'Record a business metric so it shows on the dashboard and in trend analysis.',
  inputSchema: {
    type: 'object',
    properties: {
      metric: {
        type: 'string',
        description: 'e.g. revenue, orders, roas, aov, cac, margin, tickets_open.',
      },
      value: { type: 'number' },
      dimension: { type: 'string', description: 'Optional slice, e.g. a product or channel.' },
    },
    required: ['metric', 'value'],
    additionalProperties: false,
  },
  async run(input) {
    await query(`INSERT INTO kpi_snapshots (metric, value, dimension) VALUES ($1,$2,$3)`, [
      str(input.metric),
      num(input.value) ?? 0,
      str(input.dimension) || null,
    ]);
    return 'Recorded.';
  },
});

registerTool({
  name: 'read_kpis',
  description: 'Read the latest value of each business metric.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run() {
    const rows = await query<{ metric: string; value: number; captured_at: Date }>(
      `SELECT DISTINCT ON (metric) metric, value, captured_at
         FROM kpi_snapshots ORDER BY metric, captured_at DESC`,
    );
    if (!rows.length) return 'No KPIs recorded yet — the company has not started trading.';
    return rows
      .map((r) => `${r.metric} = ${r.value} (as of ${r.captured_at.toISOString().slice(0, 16)})`)
      .join('\n');
  },
});

export { registry };
