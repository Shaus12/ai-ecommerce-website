import type { Agent } from '../api';

const DEPT_HE: Record<string, string> = {
  executive: 'הנהלה',
  sourcing: 'מוצר ורכש',
  growth: 'שיווק',
  storefront: 'חנות',
  customer: 'לקוחות',
  finance: 'כספים',
  data: 'דאטה',
  platform: 'פלטפורמה',
};

const DEPT_ORDER = [
  'executive',
  'sourcing',
  'growth',
  'storefront',
  'customer',
  'finance',
  'data',
  'platform',
];

const STATUS_HE: Record<string, string> = {
  idle: 'ממתין',
  thinking: 'חושב',
  working: 'עובד',
  waiting_approval: 'ממתין לאישור',
  blocked: 'חסום',
  error: 'שגיאה',
};

interface Props {
  agents: Agent[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export function AgentList({ agents, selected, onSelect }: Props) {
  const grouped = DEPT_ORDER.map((dept) => ({
    dept,
    members: agents.filter((a) => a.department === dept),
  })).filter((g) => g.members.length > 0);

  const busy = agents.filter((a) => a.status === 'working' || a.status === 'thinking').length;

  return (
    <div className="col">
      <div className="col-head">
        <span>הצוות · {agents.length}</span>
        <span style={{ color: busy ? 'var(--accent)' : undefined }}>
          {busy > 0 ? `${busy} פעילים` : 'שקט'}
        </span>
      </div>

      <div className="scroll">
        {grouped.map(({ dept, members }) => (
          <div className="dept" key={dept}>
            <div className="dept-name">{DEPT_HE[dept] ?? dept}</div>
            {members.map((a) => (
              <button
                key={a.id}
                type="button"
                className={[
                  'agent',
                  selected === a.id ? 'active' : '',
                  a.enabled ? '' : 'off',
                ].join(' ')}
                onClick={() => onSelect(a.id)}
                title={a.statusNote ?? STATUS_HE[a.status] ?? a.status}
              >
                <span className={`dot ${a.status}`} />
                <span className="agent-name">{a.nameHe}</span>
                <span className="agent-tier">{a.id}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export { DEPT_HE, STATUS_HE };
