/** REST surface the dashboard talks to. */

import type { FastifyInstance } from 'fastify';
import { query, one } from '../../core/db.js';
import { recent, thread, send } from '../../core/bus.js';
import { listApprovals, decideApproval, budgetState } from '../../core/guardrails.js';
import { runAgent } from '../../core/agent.js';
import { monthlyLlmSpend } from '../../core/llm.js';
import { isPaused, setPaused, persistPausedDecision, runningAgents, tick } from '../scheduler.js';

export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/state', async () => {
    const [agents, budgets, kpis, approvals, spend] = await Promise.all([
      query(
        `SELECT id, name, name_he AS "nameHe", department, reports_to AS "reportsTo",
                tier, model, status, status_note AS "statusNote",
                schedule_cron AS "scheduleCron", last_run_at AS "lastRunAt", enabled
           FROM agents ORDER BY tier, department, id`,
      ),
      budgetState(),
      query(
        `SELECT DISTINCT ON (metric) metric, value, captured_at AS "capturedAt"
           FROM kpi_snapshots ORDER BY metric, captured_at DESC`,
      ),
      listApprovals('pending'),
      monthlyLlmSpend(),
    ]);

    return {
      company: {
        name: process.env.COMPANY_NAME || null,
        product: process.env.PRODUCT_NAME || null,
        autonomy: process.env.AUTONOMY_MODE ?? 'guarded',
      },
      scheduler: { paused: isPaused(), running: runningAgents() },
      agents,
      budgets,
      kpis,
      approvals,
      llmSpendThisMonth: spend,
    };
  });

  app.get<{ Querystring: { before?: string; limit?: string } }>(
    '/api/messages',
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 80), 200);
      const before = req.query.before ? Number(req.query.before) : undefined;
      return recent(limit, before);
    },
  );

  app.get<{ Params: { id: string } }>('/api/threads/:id', async (req) => thread(req.params.id));

  app.get<{ Params: { id: string } }>('/api/agents/:id', async (req, reply) => {
    const agent = await one(
      `SELECT id, name, name_he AS "nameHe", department, reports_to AS "reportsTo",
              tier, model, effort, status, status_note AS "statusNote",
              schedule_cron AS "scheduleCron", last_run_at AS "lastRunAt",
              enabled, config
         FROM agents WHERE id = $1`,
      [req.params.id],
    );
    if (!agent) return reply.code(404).send({ error: 'unknown agent' });

    const [runs, spend] = await Promise.all([
      query(
        `SELECT id, trigger, status, summary, cost_usd AS "costUsd",
                input_tokens AS "inputTokens", output_tokens AS "outputTokens",
                started_at AS "startedAt", finished_at AS "finishedAt", error
           FROM runs WHERE agent_id = $1 ORDER BY started_at DESC LIMIT 20`,
        [req.params.id],
      ),
      one<{ total: number }>(
        `SELECT COALESCE(SUM(amount_usd),0)::numeric AS total FROM spend_ledger
          WHERE agent_id = $1 AND created_at >= date_trunc('month', now())`,
        [req.params.id],
      ),
    ]);

    return { agent, runs, spendThisMonth: spend?.total ?? 0 };
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id', async (req, reply) => {
    const run = await one(
      `SELECT id, agent_id AS "agentId", trigger, status, summary, steps,
              cost_usd AS "costUsd", started_at AS "startedAt",
              finished_at AS "finishedAt", error
         FROM runs WHERE id = $1`,
      [req.params.id],
    );
    return run ?? reply.code(404).send({ error: 'unknown run' });
  });

  app.post<{ Params: { id: string } }>('/api/agents/:id/run', async (req, reply) => {
    const exists = await one(`SELECT id FROM agents WHERE id = $1`, [req.params.id]);
    if (!exists) return reply.code(404).send({ error: 'unknown agent' });
    // Fire and forget — the dashboard watches the run over the websocket.
    void runAgent(req.params.id, 'manual');
    return { started: true };
  });

  app.post<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/api/agents/:id/enabled',
    async (req) => {
      await query(`UPDATE agents SET enabled = $2, updated_at = now() WHERE id = $1`, [
        req.params.id,
        Boolean(req.body?.enabled),
      ]);
      return { ok: true };
    },
  );

  app.post<{ Body: { to: string; subject?: string; body: string } }>(
    '/api/message',
    async (req, reply) => {
      const { to, body } = req.body ?? {};
      if (!to || !body) return reply.code(400).send({ error: 'to and body are required' });
      const msg = await send({
        from: 'human',
        to,
        kind: 'request',
        subject: req.body.subject ?? 'הוראה מהבעלים',
        body,
      });
      return msg;
    },
  );

  app.post<{ Params: { id: string }; Body: { decision: 'approved' | 'rejected'; note?: string } }>(
    '/api/approvals/:id',
    async (req, reply) => {
      const decision = req.body?.decision;
      if (decision !== 'approved' && decision !== 'rejected') {
        return reply.code(400).send({ error: 'decision must be approved or rejected' });
      }
      const result = await decideApproval(req.params.id, decision, req.body.note ?? null);
      if (!result) return reply.code(409).send({ error: 'already decided or expired' });

      // Tell the agent that asked, so it can pick the work back up.
      await send({
        from: 'human',
        to: result.requestedBy,
        kind: 'decision',
        subject: `Approval ${decision}: ${result.title}`,
        body:
          `The owner ${decision} your request "${result.title}"` +
          (result.amountUsd ? ` ($${result.amountUsd})` : '') +
          (req.body.note ? `.\nNote: ${req.body.note}` : '.'),
        payload: { approvalId: result.id, decision },
      });
      return result;
    },
  );

  app.get('/api/approvals', async (req) => {
    const status = (req.query as { status?: string })?.status ?? 'pending';
    return listApprovals(status);
  });

  app.post<{ Body: { paused: boolean } }>('/api/scheduler', async (req) => {
    const value = Boolean(req.body?.paused);
    setPaused(value);
    await persistPausedDecision(value);
    return { paused: isPaused() };
  });

  app.post('/api/scheduler/tick', async () => {
    await tick();
    return { ok: true };
  });

  app.get('/api/health', async () => {
    await query('SELECT 1');
    return { ok: true, paused: isPaused() };
  });
}
