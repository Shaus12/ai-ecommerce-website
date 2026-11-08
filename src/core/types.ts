/**
 * Shared domain types for the AI company.
 * API-shaped data (messages, tools, content blocks) uses the Anthropic SDK's
 * own types — we never redefine those here.
 */

export type Tier = 0 | 1 | 2;

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting_approval'
  | 'blocked'
  | 'error';

export type Department =
  | 'executive'
  | 'sourcing'
  | 'growth'
  | 'storefront'
  | 'customer'
  | 'finance'
  | 'data'
  | 'platform';

/** Cost/capability tier. The router maps these to concrete model ids. */
export type ModelTier = 'deep' | 'standard' | 'fast';

export interface AgentDefinition {
  id: string;
  name: string;
  /** Hebrew display name — the dashboard is Hebrew-first. */
  nameHe: string;
  department: Department;
  tier: Tier;
  reportsTo: string | null;
  /** What this agent is accountable for, in its own system prompt. */
  charter: string;
  /** Concrete, checkable outcomes this agent owns. */
  objectives: string[];
  modelTier: ModelTier;
  effort: 'low' | 'medium' | 'high' | 'xhigh';
  /** Tool names this agent may call. Everything else is denied. */
  tools: string[];
  /** Standard cron expression, or null for message-driven agents only. */
  schedule: string | null;
  /** Agents this one is allowed to message directly. '*' = its own department. */
  canMessage: string[];
  enabled?: boolean;
}

export interface AgentRow extends Omit<AgentDefinition, 'modelTier' | 'effort'> {
  model: string;
  effort: string;
  status: AgentStatus;
  statusNote: string | null;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  config: Record<string, unknown>;
}

export type MessageKind =
  | 'chat'
  | 'request'
  | 'response'
  | 'decision'
  | 'alert'
  | 'report';

export interface BusMessage {
  id: number;
  threadId: string;
  from: string;
  to: string | null;
  department: string | null;
  kind: MessageKind;
  subject: string | null;
  body: string;
  payload: Record<string, unknown>;
  inReplyTo: number | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NewMessage {
  from: string;
  to?: string | null;
  threadId?: string;
  department?: string | null;
  kind?: MessageKind;
  subject?: string | null;
  body: string;
  payload?: Record<string, unknown>;
  inReplyTo?: number | null;
}

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string | null;
  createdBy: string;
  parentId: string | null;
  status: TaskStatus;
  priority: number;
  result: Record<string, unknown> | null;
  error: string | null;
  dueAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export type ApprovalAction = 'spend' | 'publish' | 'order' | 'legal' | 'other';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface Approval {
  id: string;
  requestedBy: string;
  action: ApprovalAction;
  title: string;
  titleHe: string | null;
  rationale: string;
  payload: Record<string, unknown>;
  amountUsd: number | null;
  risk: 'low' | 'medium' | 'high';
  status: ApprovalStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface MemoryEntry {
  id: string;
  namespace: string;
  key: string | null;
  content: string;
  metadata: Record<string, unknown>;
  author: string;
  confidence: number;
  createdAt: Date;
}

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  costUsd: number;
  model: string;
}

export interface RunStep {
  at: string;
  type: 'thinking' | 'text' | 'tool_use' | 'tool_result' | 'error';
  label: string;
  detail?: unknown;
}

/** Context handed to every tool implementation at call time. */
export interface ToolContext {
  agentId: string;
  runId: string;
  threadId: string | null;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  inputSchema: Record<string, unknown>;
  /** Tools that move money or publish must be gated. */
  requiresApproval?: boolean;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}
