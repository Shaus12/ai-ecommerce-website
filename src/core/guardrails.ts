/**
 * The brakes.
 *
 * Three classes of action never happen autonomously: spending real money,
 * publishing in the company's name, and anything legally binding. Those open
 * an approval the owner clears from the dashboard. Everything else runs free.
 */

import { query, one } from './db.js';
import type { Approval, ApprovalAction } from './types.js';

export type AutonomyMode = 'guarded' | 'full';

export function autonomyMode(): AutonomyMode {
  return process.env.AUTONOMY_MODE === 'full' ? 'full' : 'guarded';
}

export function approvalThresholdUsd(): number {
  const raw = Number(process.env.APPROVAL_THRESHOLD_USD ?? 25);
  return Number.isFinite(raw) ? raw : 25;
}

/**
 * Actions that always need a human, regardless of mode. Even in 'full'
 * autonomy, legal commitments stay with the owner — an agent cannot bind
 * the company to a contract.
 */
const ALWAYS_GATED: ReadonlySet<ApprovalAction> = new Set<ApprovalAction>(['legal']);

export function needsApproval(action: ApprovalAction, amountUsd = 0): boolean {
  if (ALWAYS_GATED.has(action)) return true;
  if (autonomyMode() === 'full') return false;
  if (action === 'spend' || action === 'order') return amountUsd > 0;
  return action === 'publish';
}

interface ApprovalRow {
  id: string;
  requested_by: string;
  action: string;
  title: string;
  title_he: string | null;
  rationale: string;
  payload: Record<string, unknown>;
  amount_usd: number | null;
  risk: string;
  status: string;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  expires_at: Date;
  created_at: Date;
}

const toApproval = (r: ApprovalRow): Approval => ({
  id: r.id,
  requestedBy: r.requested_by,
  action: r.action as ApprovalAction,
  title: r.title,
  titleHe: r.title_he,
  rationale: r.rationale,
  payload: r.payload,
  amountUsd: r.amount_usd,
  risk: r.risk as Approval['risk'],
  status: r.status as Approval['status'],
  decidedBy: r.decided_by,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
});

export interface ApprovalRequest {
  requestedBy: string;
  action: ApprovalAction;
  title: string;
  titleHe?: string;
  rationale: string;
  payload?: Record<string, unknown>;
  amountUsd?: number;
  risk?: 'low' | 'medium' | 'high';
}

export async function requestApproval(req: ApprovalRequest): Promise<Approval> {
  const row = await one<ApprovalRow>(
    `INSERT INTO approvals
       (requested_by, action, title, title_he, rationale, payload, amount_usd, risk)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      req.requestedBy,
      req.action,
      req.title,
      req.titleHe ?? null,
      req.rationale,
      JSON.stringify(req.payload ?? {}),
      req.amountUsd ?? null,
      req.risk ?? 'medium',
    ],
  );
  return toApproval(row!);
}

export async function listApprovals(status = 'pending'): Promise<Approval[]> {
  const rows = await query<ApprovalRow>(
    `SELECT * FROM approvals WHERE status = $1 ORDER BY created_at DESC LIMIT 100`,
    [status],
  );
  return rows.map(toApproval);
}

export async function decideApproval(
  id: string,
  decision: 'approved' | 'rejected',
  note: string | null,
  decidedBy = 'human',
): Promise<Approval | null> {
  const row = await one<ApprovalRow>(
    `UPDATE approvals
        SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [id, decision, decidedBy, note],
  );
  return row ? toApproval(row) : null;
}

/** Sweeps approvals nobody answered in time so agents stop waiting on them. */
export async function expireStaleApprovals(): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE approvals SET status = 'expired'
      WHERE status = 'pending' AND expires_at < now()
      RETURNING id`,
  );
  return rows.length;
}

export interface BudgetState {
  id: string;
  labelHe: string;
  limitUsd: number;
  spentUsd: number;
  hardStop: boolean;
}

export async function budgetState(): Promise<BudgetState[]> {
  return query<BudgetState>(
    `SELECT b.id,
            b.label_he  AS "labelHe",
            b.limit_usd AS "limitUsd",
            b.hard_stop AS "hardStop",
            COALESCE((
              SELECT SUM(s.amount_usd) FROM spend_ledger s
               WHERE s.budget_id = b.id
                 AND s.created_at >= date_trunc(b.period, now())
            ), 0) AS "spentUsd"
       FROM budgets b
      ORDER BY b.id`,
  );
}

/** True when the named budget still has room for `amount`. */
export async function budgetAllows(budgetId: string, amount: number): Promise<boolean> {
  const states = await budgetState();
  const b = states.find((s) => s.id === budgetId);
  if (!b) return true;
  if (!b.hardStop) return true;
  return b.spentUsd + amount <= b.limitUsd;
}
