import { useEffect, useRef, useState } from 'react';
import type { Agent, Message } from '../api';

/** A transient line showing an agent mid-thought — never persisted. */
export interface LiveLine {
  key: string;
  agent: string;
  type: string;
  label: string;
}

const KIND_HE: Record<string, string> = {
  chat: 'שיחה',
  request: 'בקשה',
  response: 'תשובה',
  decision: 'החלטה',
  alert: 'התראה',
  report: 'דיווח',
};

const STEP_HE: Record<string, string> = {
  thinking: 'חושב',
  tool_use: 'מפעיל כלי',
  tool_result: 'תוצאה',
  text: 'כותב',
  error: 'שגיאה',
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

interface Props {
  messages: Message[];
  live: LiveLine[];
  agents: Agent[];
  connected: boolean;
  onSend: (to: string, body: string) => Promise<void>;
}

export function Feed({ messages, live, agents, connected, onSend }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [target, setTarget] = useState('ceo');
  const [sending, setSending] = useState(false);

  const nameOf = (id: string | null): string => {
    if (!id) return 'כולם';
    if (id === 'human') return 'אתה';
    return agents.find((a) => a.id === id)?.nameHe ?? id;
  };

  // Keep the newest activity in view, but never yank the page while the
  // owner is reading something further up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages, live]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(target, body);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="col">
      <div className="col-head">
        <span>זרם החברה</span>
        <span style={{ color: connected ? 'var(--ok)' : 'var(--danger)' }}>
          {connected ? '● משודר חי' : '● מנותק'}
        </span>
      </div>

      <div className="scroll" ref={scrollRef}>
        <div className="feed">
          {messages.length === 0 && live.length === 0 && (
            <div className="empty">
              עדיין שקט. הסוכנים מתעוררים לפי לוח הזמנים שלהם — או שאפשר להעיר מישהו ידנית.
            </div>
          )}

          {messages.map((m) => (
            <div className="msg" key={m.id}>
              <div className="msg-head">
                <span className={`who ${m.from === 'human' ? 'human' : ''}`}>{nameOf(m.from)}</span>
                <span className="arrow">←</span>
                <span className="to">{nameOf(m.to)}</span>
                <span className={`kind ${m.kind}`}>{KIND_HE[m.kind] ?? m.kind}</span>
                <span className="time">{time(m.createdAt)}</span>
              </div>
              {m.subject && <div className="msg-subject">{m.subject}</div>}
              <div className="msg-body clamp">{m.body}</div>
            </div>
          ))}

          {live.map((l) => (
            <div className="live" key={l.key}>
              <div className="live-head">
                <span className="who">{nameOf(l.agent)}</span>
                <span className="kind">{STEP_HE[l.type] ?? l.type}</span>
              </div>
              <div
                className={`live-body ${l.type === 'tool_use' ? 'tool' : ''} ${
                  l.type === 'tool_result' ? 'result' : ''
                }`}
              >
                {l.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="compose">
        <textarea
          value={draft}
          placeholder="כתוב הוראה לסוכן… (Ctrl+Enter לשליחה)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
          }}
        />
        <div className="compose-row">
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nameHe} — {a.id}
              </option>
            ))}
          </select>
          <button
            className="btn primary"
            onClick={() => void submit()}
            disabled={sending || !draft.trim()}
          >
            {sending ? 'שולח…' : 'שלח'}
          </button>
        </div>
      </div>
    </div>
  );
}
