-- AI Company — core schema
-- Postgres 17 + pgvector. Single database, no Redis: LISTEN/NOTIFY is the bus.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- agents

CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,               -- e.g. 'media-buyer'
  name          TEXT NOT NULL,
  name_he       TEXT NOT NULL,
  department    TEXT NOT NULL,
  reports_to    TEXT REFERENCES agents(id),
  tier          SMALLINT NOT NULL DEFAULT 2,    -- 0 exec, 1 dept head, 2 worker
  model         TEXT NOT NULL,
  effort        TEXT NOT NULL DEFAULT 'medium',
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  status        TEXT NOT NULL DEFAULT 'idle',   -- idle|thinking|working|blocked|error
  status_note   TEXT,
  schedule_cron TEXT,                           -- when this agent wakes on its own
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agents_department_idx ON agents(department);
CREATE INDEX IF NOT EXISTS agents_next_run_idx   ON agents(next_run_at) WHERE enabled;

-- ------------------------------------------------------- inter-agent bus

CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL PRIMARY KEY,
  thread_id   UUID NOT NULL DEFAULT gen_random_uuid(),
  from_agent  TEXT NOT NULL,                    -- agent id, or 'human', or 'system'
  to_agent    TEXT,                             -- NULL = broadcast to department
  department  TEXT,
  kind        TEXT NOT NULL DEFAULT 'chat',     -- chat|request|response|decision|alert|report
  subject     TEXT,
  body        TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  in_reply_to BIGINT REFERENCES messages(id),
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_to_unread_idx ON messages(to_agent, created_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS messages_thread_idx    ON messages(thread_id, id);
CREATE INDEX IF NOT EXISTS messages_recent_idx    ON messages(created_at DESC);

-- Push every new message to listeners (dashboard websocket + agent inbox wakeups)
CREATE OR REPLACE FUNCTION notify_message() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('bus', json_build_object(
    'type','message','id',NEW.id,'thread_id',NEW.thread_id,
    'from',NEW.from_agent,'to',NEW.to_agent,'kind',NEW.kind
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_notify ON messages;
CREATE TRIGGER messages_notify AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION notify_message();

-- ----------------------------------------------------------------- tasks

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  assigned_to  TEXT REFERENCES agents(id),
  created_by   TEXT NOT NULL,
  parent_id    UUID REFERENCES tasks(id),
  status       TEXT NOT NULL DEFAULT 'pending', -- pending|running|blocked|done|failed|cancelled
  priority     SMALLINT NOT NULL DEFAULT 5,     -- 1 highest .. 9 lowest
  result       JSONB,
  error        TEXT,
  due_at       TIMESTAMPTZ,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_queue_idx ON tasks(status, priority, created_at);
CREATE INDEX IF NOT EXISTS tasks_agent_idx ON tasks(assigned_to, status);

-- ---------------------------------------------------------------- memory

CREATE TABLE IF NOT EXISTS memory (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace  TEXT NOT NULL,                     -- 'product'|'customer'|'creative'|'lesson'|...
  key        TEXT,
  content    TEXT NOT NULL,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  author     TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  embedding  vector(1024),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_ns_idx   ON memory(namespace, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS memory_key_idx ON memory(namespace, key) WHERE key IS NOT NULL;
CREATE INDEX IF NOT EXISTS memory_fts_idx  ON memory USING gin(to_tsvector('simple', content));

-- ------------------------------------------------------------- approvals

CREATE TABLE IF NOT EXISTS approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by  TEXT NOT NULL,
  action        TEXT NOT NULL,                  -- 'spend'|'publish'|'order'|'legal'|'other'
  title         TEXT NOT NULL,
  title_he      TEXT,
  rationale     TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  amount_usd    NUMERIC(12,2),
  risk          TEXT NOT NULL DEFAULT 'medium', -- low|medium|high
  status        TEXT NOT NULL DEFAULT 'pending',-- pending|approved|rejected|expired
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '48 hours',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approvals_pending_idx ON approvals(status, created_at DESC);

CREATE OR REPLACE FUNCTION notify_approval() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('bus', json_build_object(
    'type','approval','id',NEW.id::text,'status',NEW.status,'action',NEW.action
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS approvals_notify ON approvals;
CREATE TRIGGER approvals_notify AFTER INSERT OR UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION notify_approval();

-- ------------------------------------------------------- spend & budget

CREATE TABLE IF NOT EXISTS budgets (
  id           TEXT PRIMARY KEY,                -- 'ads'|'llm'|'suppliers'|'tools'
  label_he     TEXT NOT NULL,
  period       TEXT NOT NULL DEFAULT 'month',   -- day|month
  limit_usd    NUMERIC(12,2) NOT NULL,
  hard_stop    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spend_ledger (
  id          BIGSERIAL PRIMARY KEY,
  budget_id   TEXT NOT NULL REFERENCES budgets(id),
  agent_id    TEXT,
  amount_usd  NUMERIC(12,6) NOT NULL,
  note        TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spend_budget_time_idx ON spend_ledger(budget_id, created_at DESC);

-- ------------------------------------------------------------- run traces

CREATE TABLE IF NOT EXISTS runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT NOT NULL,
  trigger       TEXT NOT NULL,                  -- 'schedule'|'message'|'task'|'manual'
  task_id       UUID REFERENCES tasks(id),
  status        TEXT NOT NULL DEFAULT 'running',-- running|ok|error
  summary       TEXT,
  steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read    INTEGER NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(12,6) NOT NULL DEFAULT 0,
  model         TEXT,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS runs_agent_idx  ON runs(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS runs_recent_idx ON runs(started_at DESC);

-- --------------------------------------------------------- company state

-- Durable switches the owner flips from the dashboard (e.g. pause/run),
-- so a restart never silently overrides a decision.
CREATE TABLE IF NOT EXISTS company_state (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ kpis

CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  metric      TEXT NOT NULL,                    -- 'revenue'|'orders'|'roas'|'aov'|'cac'|...
  value       NUMERIC(16,4) NOT NULL,
  dimension   TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kpi_metric_idx ON kpi_snapshots(metric, captured_at DESC);
