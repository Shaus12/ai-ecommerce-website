/**
 * Model router + spend meter.
 *
 * Three tiers keep a 26-agent company inside a small monthly budget:
 *   deep     → Claude Opus 5    ($5/$25 per MTok)  — strategy, finance, security
 *   standard → Claude Sonnet 5  ($2/$10 per MTok)  — most department work
 *   fast     → Claude Haiku 4.5 ($1/$5  per MTok)  — routine, high-frequency
 *
 * Every call is metered into spend_ledger, and the monthly LLM ceiling is a
 * hard stop: agents refuse to run rather than silently overspend.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ModelTier, RunUsage } from './types.js';
import { query, one } from './db.js';

export const client = new Anthropic();

export const MODEL_BY_TIER: Record<ModelTier, string> = {
  deep: 'claude-opus-5',
  standard: 'claude-sonnet-5',
  fast: 'claude-haiku-4-5',
};

/** USD per million tokens. */
const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
};

const MAX_TOKENS_BY_TIER: Record<ModelTier, number> = {
  deep: 32_000,
  standard: 16_000,
  fast: 8_000,
};

export class BudgetExceededError extends Error {
  constructor(public readonly spent: number, public readonly limit: number) {
    super(`LLM budget exhausted: $${spent.toFixed(2)} of $${limit.toFixed(2)} this month`);
    this.name = 'BudgetExceededError';
  }
}

export function tierOf(model: string): ModelTier {
  const hit = (Object.entries(MODEL_BY_TIER) as [ModelTier, string][]).find(
    ([, id]) => id === model,
  );
  return hit?.[0] ?? 'standard';
}

export function costOf(model: string, usage: Anthropic.Usage | Anthropic.Beta.BetaUsage): number {
  const p = PRICING[model] ?? PRICING['claude-sonnet-5']!;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return (
    (usage.input_tokens * p.input +
      cacheWrite * p.input * 1.25 +
      cacheRead * p.cacheRead +
      usage.output_tokens * p.output) /
    1_000_000
  );
}

/** Dollars spent on LLM calls in the current calendar month. */
export async function monthlyLlmSpend(): Promise<number> {
  const row = await one<{ total: number | null }>(
    `SELECT COALESCE(SUM(amount_usd), 0)::numeric AS total
       FROM spend_ledger
      WHERE budget_id = 'llm' AND created_at >= date_trunc('month', now())`,
  );
  return row?.total ?? 0;
}

export async function assertBudget(): Promise<void> {
  const limit = Number(process.env.LLM_BUDGET_USD ?? 250);
  if (!Number.isFinite(limit) || limit <= 0) return;
  const spent = await monthlyLlmSpend();
  if (spent >= limit) throw new BudgetExceededError(spent, limit);
}

export async function recordSpend(
  agentId: string,
  usage: RunUsage,
  note: string,
): Promise<void> {
  await query(
    `INSERT INTO spend_ledger (budget_id, agent_id, amount_usd, note, metadata)
     VALUES ('llm', $1, $2, $3, $4)`,
    [
      agentId,
      usage.costUsd,
      note,
      JSON.stringify({
        model: usage.model,
        input: usage.inputTokens,
        output: usage.outputTokens,
        cacheRead: usage.cacheRead,
      }),
    ],
  );
}

export interface CallOptions {
  tier: ModelTier;
  effort: 'low' | 'medium' | 'high' | 'xhigh';
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  tools?: Anthropic.Beta.BetaToolUnion[];
  /** Streams summarized reasoning so the dashboard can show agents thinking. */
  onThinking?: (delta: string) => void;
  onText?: (delta: string) => void;
}

/**
 * One turn against the API. Returns the complete message.
 * Callers own the agentic loop (see agent.ts) so every step can be traced.
 */
export async function callModel(
  opts: CallOptions,
): Promise<Anthropic.Beta.BetaMessage> {
  const model = MODEL_BY_TIER[opts.tier];
  const isModern = opts.tier !== 'fast'; // Haiku 4.5 rejects adaptive thinking + effort

  const betas: Anthropic.Beta.AnthropicBeta[] = [];
  const params: Anthropic.Beta.MessageCreateParamsStreaming = {
    model,
    max_tokens: MAX_TOKENS_BY_TIER[opts.tier],
    system: opts.system,
    messages: opts.messages,
    stream: true,
  };

  if (opts.tools?.length) params.tools = opts.tools;

  if (isModern) {
    params.thinking = { type: 'adaptive', display: 'summarized' };
    params.output_config = { effort: opts.effort };
  }

  // Opus 5 can decline on safety grounds; server-side fallback keeps the
  // company running by re-serving the same request on another model.
  if (opts.tier === 'deep') {
    betas.push('server-side-fallback-2026-07-01');
    params.fallbacks = 'default';
  }
  if (betas.length) params.betas = betas;

  const stream = client.beta.messages.stream(params);

  if (opts.onThinking) {
    stream.on('thinking', (delta: string) => opts.onThinking!(delta));
  }
  if (opts.onText) {
    stream.on('text', (delta: string) => opts.onText!(delta));
  }

  return stream.finalMessage();
}
