/**
 * Minimal 5-field cron matcher: "minute hour day-of-month month day-of-week".
 * Supports wildcards, step values, ranges, ranges with steps, and comma
 * lists. That covers everything the roster uses, and avoids a dependency
 * for about sixty lines of logic.
 */

function matchField(spec: string, value: number, min: number, max: number): boolean {
  for (const part of spec.split(',')) {
    const [range, stepRaw] = part.split('/');
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isFinite(step) || step < 1) continue;

    let lo: number;
    let hi: number;
    if (range === '*' || range === undefined) {
      lo = min;
      hi = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-').map(Number);
      if (!Number.isFinite(a!) || !Number.isFinite(b!)) continue;
      lo = a!;
      hi = b!;
    } else {
      const n = Number(range);
      if (!Number.isFinite(n)) continue;
      lo = n;
      hi = n;
    }
    if (value < lo || value > hi) continue;
    if ((value - lo) % step === 0) return true;
  }
  return false;
}

/** True when `expr` fires at `date` (minute resolution). */
export function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [min, hour, dom, month, dow] = fields as [string, string, string, string, string];

  return (
    matchField(min, date.getMinutes(), 0, 59) &&
    matchField(hour, date.getHours(), 0, 23) &&
    matchField(dom, date.getDate(), 1, 31) &&
    matchField(month, date.getMonth() + 1, 1, 12) &&
    matchField(dow, date.getDay(), 0, 6)
  );
}
