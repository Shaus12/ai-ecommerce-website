import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  connectLive,
  getToken,
  setToken,
  Unauthorised,
  type LiveEvent,
  type Message,
  type State,
} from './api';
import { AgentList } from './components/AgentList';
import { Feed, type LiveLine } from './components/Feed';
import { SidePanel } from './components/SidePanel';
import { AgentDrawer } from './components/AgentDrawer';

const MAX_LIVE_LINES = 14;
const MAX_MESSAGES = 200;

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="gate">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setToken(value.trim());
          onUnlock();
        }}
      >
        <div style={{ textAlign: 'center', fontWeight: 700, marginBottom: 4 }}>חדר הבקרה</div>
        <input
          type="password"
          value={value}
          autoFocus
          placeholder="סיסמה"
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="btn primary" type="submit">
          כניסה
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [live, setLive] = useState<LiveLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [locked, setLocked] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [gateKey, setGateKey] = useState(0);

  const refreshTimer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([api.state(), api.messages()]);
      setState(s);
      setMessages(m.reverse().slice(-MAX_MESSAGES));
      setLocked(false);
    } catch (err) {
      if (err instanceof Unauthorised) setLocked(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, gateKey]);

  // The websocket carries notifications, not payloads — a nudge to re-read.
  // Debounced so a burst of agent activity is one fetch, not thirty.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = undefined;
      void refresh();
    }, 700);
  }, [refresh]);

  useEffect(() => {
    if (locked) return;
    const teardown = connectLive((e: LiveEvent) => {
      if (e.type === 'step') {
        const label = e.step?.label ?? '';
        if (!label.trim()) return;
        setLive((prev) =>
          [
            ...prev,
            {
              key: `${e.runId}-${prev.length}-${Date.now()}`,
              agent: e.agent,
              type: e.step.type,
              label,
            },
          ].slice(-MAX_LIVE_LINES),
        );
        return;
      }
      if (e.type === 'run' && e.status !== 'running') {
        // Shift over — clear that agent's transient thinking lines.
        setLive((prev) => prev.filter((l) => l.agent !== e.agent));
      }
      scheduleRefresh();
    }, setConnected);

    return () => {
      teardown();
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = undefined;
    };
  }, [locked, scheduleRefresh, gateKey]);

  if (locked && !getToken()) {
    return <PasswordGate onUnlock={() => setGateKey((k) => k + 1)} />;
  }

  if (!state) {
    return <div className="empty" style={{ marginTop: 80 }}>מתחבר לחברה…</div>;
  }

  const paused = state.scheduler.paused;
  const llmBudget = state.budgets.find((b) => b.id === 'llm');
  const pct = llmBudget && llmBudget.limitUsd > 0
    ? (llmBudget.spentUsd / llmBudget.limitUsd) * 100
    : 0;
  const busy = state.agents.filter(
    (a) => a.status === 'working' || a.status === 'thinking',
  ).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className={`brand-dot ${paused ? 'paused' : ''}`} />
          {state.company.name || 'החברה'}
        </div>

        <div className="stats">
          <div className="stat">
            <div className={`stat-v ${busy ? 'ok' : ''}`}>{busy}</div>
            <div className="stat-l">פעילים</div>
          </div>
          <div className="stat">
            <div className={`stat-v ${state.approvals.length ? 'warn' : ''}`}>
              {state.approvals.length}
            </div>
            <div className="stat-l">לאישור</div>
          </div>
          <div className="stat">
            <div className={`stat-v ${pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : ''}`}>
              ${state.llmSpendThisMonth.toFixed(2)}
            </div>
            <div className="stat-l">עלות החודש</div>
          </div>
          <button
            className="btn"
            onClick={async () => {
              await api.setPaused(!paused);
              void refresh();
            }}
          >
            {paused ? 'הפעל הכל' : 'עצור הכל'}
          </button>
        </div>
      </header>

      <div className="main">
        <AgentList agents={state.agents} selected={selected} onSelect={setSelected} />

        <Feed
          messages={messages}
          live={live}
          agents={state.agents}
          connected={connected}
          onSend={async (to, body) => {
            await api.sendMessage(to, body);
            void refresh();
          }}
        />

        <SidePanel
          approvals={state.approvals}
          budgets={state.budgets}
          kpis={state.kpis}
          onDecide={async (id, decision) => {
            await api.decide(id, decision);
            void refresh();
          }}
        />
      </div>

      {selected && <AgentDrawer agentId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
