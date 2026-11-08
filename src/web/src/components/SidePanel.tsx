import { useState } from 'react';
import type { Approval, Budget, Kpi } from '../api';

const ACTION_HE: Record<string, string> = {
  spend: 'הוצאה',
  publish: 'פרסום',
  order: 'הזמנה מספק',
  legal: 'משפטי',
  other: 'אחר',
};

const METRIC_HE: Record<string, string> = {
  revenue: 'הכנסות',
  orders: 'הזמנות',
  roas: 'ROAS',
  aov: 'ערך הזמנה ממוצע',
  cac: 'עלות רכישת לקוח',
  margin: 'מרווח',
  tickets_open: 'פניות פתוחות',
};

interface Props {
  approvals: Approval[];
  budgets: Budget[];
  kpis: Kpi[];
  onDecide: (id: string, decision: 'approved' | 'rejected') => Promise<void>;
}

export function SidePanel({ approvals, budgets, kpis, onDecide }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    setBusy(id);
    try {
      await onDecide(id, decision);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="col">
      <div className="col-head">
        <span>ממתין לך</span>
        {approvals.length > 0 && <span style={{ color: 'var(--warn)' }}>{approvals.length}</span>}
      </div>

      <div className="scroll">
        {approvals.length === 0 ? (
          <div className="empty">אין מה לאשר. הסוכנים ממשיכים לבד.</div>
        ) : (
          approvals.map((a) => (
            <div className={`card ${a.risk === 'high' ? 'urgent' : ''}`} key={a.id}>
              <div className="card-top">
                <span className="card-title">{a.titleHe ?? a.title}</span>
                {a.amountUsd != null && <span className="amount">${a.amountUsd}</span>}
              </div>
              <div className="card-meta">
                {ACTION_HE[a.action] ?? a.action} · {a.requestedBy}
              </div>
              <div className="card-why">{a.rationale}</div>
              <div className="card-actions">
                <button
                  className="btn primary"
                  disabled={busy === a.id}
                  onClick={() => void decide(a.id, 'approved')}
                >
                  אשר
                </button>
                <button
                  className="btn ghost-danger"
                  disabled={busy === a.id}
                  onClick={() => void decide(a.id, 'rejected')}
                >
                  דחה
                </button>
              </div>
            </div>
          ))
        )}

        <div className="col-head" style={{ marginTop: 8 }}>
          <span>תקציבים</span>
        </div>
        {budgets.map((b) => {
          const pct = b.limitUsd > 0 ? Math.min(100, (b.spentUsd / b.limitUsd) * 100) : 0;
          const level = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : '';
          return (
            <div style={{ padding: '8px 16px' }} key={b.id}>
              <div className="kv" style={{ border: 0, padding: 0 }}>
                <span>{b.labelHe}</span>
                <span>
                  ${b.spentUsd.toFixed(2)} / ${b.limitUsd.toFixed(0)}
                </span>
              </div>
              <div className="bar">
                <i className={level} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}

        <div className="col-head" style={{ marginTop: 8 }}>
          <span>מדדים</span>
        </div>
        {kpis.length === 0 ? (
          <div className="empty">אין עדיין מדדים — החברה טרם התחילה למכור.</div>
        ) : (
          <div style={{ padding: '4px 16px 20px' }}>
            {kpis.map((k) => (
              <div className="kv" key={k.metric}>
                <span>{METRIC_HE[k.metric] ?? k.metric}</span>
                <span>{k.value.toLocaleString('he-IL')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
