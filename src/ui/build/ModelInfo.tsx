import { clsx } from 'clsx'
import type { Grain } from '../../data/types'
import type { DriverFit, DriverModel, DriverTerm } from '../../model/drivers'
import { Badge, type Tone } from '../primitives'

/** How much to trust a fitted effect, in plain words. */
export function reliability(p: number): { label: string; tone: Tone } {
  if (p < 0.05) return { label: 'Clear effect', tone: 'up' }
  if (p < 0.1) return { label: 'Weak evidence', tone: 'warn' }
  return { label: 'Unclear', tone: 'down' }
}

/** One-line reading of a coefficient in business terms. */
export function interpret(m: DriverModel, term: DriverTerm, grain: Grain) {
  const lag = term.lag ? ` ${term.lag} ${grain}${term.lag > 1 ? 's' : ''} later` : ''
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(Math.abs(v) < 1 ? 2 : 1)}%`
  if (m.targetTransform === 'log' && term.transform === 'log') return `+10% ${term.label} → ${pct((1.1 ** term.coef - 1) * 100)} ${m.targetLabel}${lag}`
  if (m.targetTransform === 'log' && term.transform === 'raw') return `+1 ${term.label} → ${pct((Math.exp(term.coef) - 1) * 100)} ${m.targetLabel}${lag}`
  if (m.targetTransform === 'log' && term.transform === 'logit') {
    // Effect of +1 percentage point around a typical 10% rate.
    const dz = Math.log(0.11 / 0.89) - Math.log(0.1 / 0.9)
    return `+1 pt ${term.label} (near 10%) → ${pct((Math.exp(term.coef * dz) - 1) * 100)} ${m.targetLabel}${lag}`
  }
  return `${term.label}: coefficient ${term.coef.toPrecision(3)}${lag}`
}

export function LagScan({ term, onUse }: { term: DriverTerm; onUse: (lag: number) => void }) {
  const valid = term.lagScan.filter((s) => Number.isFinite(s.r))
  const best = [...valid].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0]
  const max = Math.max(0.01, ...valid.map((s) => Math.abs(s.r)))
  return (
    <div>
      <div className="flex h-8 items-end gap-1" role="img" aria-label={`Correlation by lag; strongest at lag ${best?.lag ?? 0}`}>
        {term.lagScan.map((s) => (
          <div key={s.lag} className="flex flex-1 flex-col items-center gap-0.5">
            <div
              title={`lag ${s.lag}: r = ${Number.isFinite(s.r) ? s.r.toFixed(3) : 'n/a'}`}
              className={clsx('w-full rounded-sm', s.lag === term.lag ? 'bg-accent' : s.lag === best?.lag ? 'bg-ink/40' : 'bg-line')}
              style={{ height: `${Math.max(10, ((Number.isFinite(s.r) ? Math.abs(s.r) : 0) / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-faint tabular">
        <span>lag 0</span>
        {best && best.lag !== term.lag ? (
          <button type="button" onClick={() => onUse(best.lag)} className="font-medium text-accent hover:underline">
            Use Lag {best.lag} (Strongest)
          </button>
        ) : (
          <span>current lag is strongest</span>
        )}
        <span>{term.lagScan.length - 1}</span>
      </div>
    </div>
  )
}

/** Compact model summary for a card whose value is predicted from model drivers. */
export function ModelSummary({ fit, grain }: { fit: DriverFit; grain: Grain }) {
  if (!fit.ok) return <p className="rounded-lg bg-down-soft px-2.5 py-2 text-xs">Model not fitted: {fit.error}</p>
  const wf = fit.walkForward
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {fit.terms.map((t) => {
          const r = reliability(t.p)
          return (
            <li key={t.edgeId} className="rounded-lg border border-line px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{t.label}</span>
                <Badge tone={r.tone}>{r.label}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted">{interpret(fit, t, grain)}</p>
              {t.signMismatch && <p className="mt-1 text-xs text-down">Direction is the opposite of what you expected.</p>}
            </li>
          )
        })}
      </ul>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
          <dt className="text-faint">Explains (R²)</dt>
          <dd className="text-sm tabular">{(fit.r2 * 100).toFixed(0)}%</dd>
        </div>
        <div className="rounded-lg bg-surface-2 px-2.5 py-1.5" title="Share of held-out periods where the model got the direction of change right">
          <dt className="text-faint">Direction Right</dt>
          <dd className="text-sm tabular">{wf ? `${(wf.directionHit * 100).toFixed(0)}%` : '—'}</dd>
        </div>
      </dl>
      <p className="text-[11px] leading-4 text-faint">
        Fitted on {fit.n} {grain}s of history ({fit.firstDate} → {fit.lastDate}). Shows association, not proof of cause.
      </p>
    </div>
  )
}
