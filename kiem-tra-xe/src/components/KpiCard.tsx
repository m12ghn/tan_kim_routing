import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'good' | 'warn' | 'bad';

export default function KpiCard(props: { label: string; value: ReactNode; unit?: string; hint?: string; tone?: Tone }) {
  const { label, value, unit, hint, tone = 'neutral' } = props;
  return (
    <div className={`kpi kpi-${tone}`} title={hint}>
      <div className="kpi-label">
        {label}
        {hint && <span className="hint-dot" aria-label={hint}>?</span>}
      </div>
      <div className="kpi-value">
        {value}
        {unit && <span className="kpi-unit"> {unit}</span>}
      </div>
    </div>
  );
}
