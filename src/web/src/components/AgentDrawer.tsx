import { useEffect, useState } from 'react';
import { api, type AgentDetail } from '../api';
import { STATUS_HE } from './AgentList';

interface Props {
  agentId: string;
  onClose: () => void;
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export function AgentDrawer({ agentId, onClose }: Props) {
  const [data, setData] = useState<AgentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);

  const load = () => {
    api
      .agent(agentId)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    setData(null);
    setError(null);
    load();
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const wake = async () => {
    setWaking(true);
    try {
      await api.runAgent(agentId);
      setTimeout(load, 2500);
    } finally {
      setWaking(false);
    }
  };

  const config = (data?.agent.config ?? {}) as {
    charter?: string;
    objectives?: string[];
    tools?: string[];
  };

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          {data && <span className={`dot ${data.agent.status}`} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{data?.agent.nameHe ?? agentId}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
              {agentId} · {data?.agent.model ?? ''}
            </div>
          </div>
          <button className="btn" onClick={() => void wake()} disabled={waking || !data}>
            {waking ? 'מעיר…' : 'הער עכשיו'}
          </button>
          <button className="btn" onClick={onClose}>
            סגור
          </button>
        </div>

        <div className="scroll">
          <div className="drawer-body">
            {error && <div className="empty">שגיאה בטעינה: {error}</div>}
            {!data && !error && <div className="empty">טוען…</div>}

            {data && (
              <>
                <div className="kv">
                  <span>מצב</span>
                  <span>{STATUS_HE[data.agent.status] ?? data.agent.status}</span>
                </div>
                <div className="kv">
                  <span>מדווח ל</span>
                  <span>{data.agent.reportsTo ?? 'הבעלים'}</span>
                </div>
                <div className="kv">
                  <span>לוח זמנים</span>
                  <span>{data.agent.scheduleCron ?? 'לפי הודעות בלבד'}</span>
                </div>
                <div className="kv">
                  <span>ריצה אחרונה</span>
                  <span>{when(data.agent.lastRunAt)}</span>
                </div>
                <div className="kv">
                  <span>עלות החודש</span>
                  <span>${Number(data.spendThisMonth).toFixed(3)}</span>
                </div>

                <div className="section-label">המנדט</div>
                <div className="charter">{config.charter ?? '—'}</div>

                {config.objectives && config.objectives.length > 0 && (
                  <>
                    <div className="section-label">אחראי על</div>
                    <ul style={{ paddingInlineStart: 18, fontSize: 12.5, color: 'var(--muted)' }}>
                      {config.objectives.map((o, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>
                          {o}
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {config.tools && (
                  <>
                    <div className="section-label">כלים</div>
                    <div
                      style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}
                    >
                      {config.tools.join(' · ')}
                    </div>
                  </>
                )}

                <div className="section-label">משמרות אחרונות</div>
                {data.runs.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--dim)' }}>עוד לא רץ.</div>
                ) : (
                  data.runs.map((r) => (
                    <div className="run" key={r.id}>
                      <div className="run-top">
                        <span
                          style={{
                            color:
                              r.status === 'ok'
                                ? 'var(--ok)'
                                : r.status === 'error'
                                  ? 'var(--danger)'
                                  : 'var(--dim)',
                          }}
                        >
                          ●
                        </span>
                        <span>{when(r.startedAt)}</span>
                        <span>· {r.trigger}</span>
                        <span style={{ marginInlineStart: 'auto' }}>
                          ${Number(r.costUsd).toFixed(4)}
                        </span>
                      </div>
                      <div className="run-summary">{r.error ?? r.summary ?? '—'}</div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
