import { clsx } from 'clsx'
import { AlertTriangle, ArrowRight, Check, GitBranch, X } from 'lucide-react'
import type { Grain } from '../../data/types'
import { TRANSFORM_LABEL, type DriverModel, type DriverTerm, type Transform } from '../../model/drivers'
import { useStore } from '../../state/store'
import { activeTree, useTrees } from '../../state/trees'
import type { ModelType, Tree } from '../../tree/types'
import { useTreeModel } from '../build/useTreeModel'
import { Button, Segmented, Select } from '../primitives'

function scaled(t: Transform, label: string) {
  return t === 'raw' ? label : `${TRANSFORM_LABEL[t]}(${label})`
}

function fmtCoef(v: number) {
  const a = Math.abs(v)
  if (a === 0) return '0'
  if (a < 0.001 || a >= 10_000) return v.toExponential(2)
  return v.toFixed(a < 1 ? 4 : 2)
}

function pLabel(p: number) {
  return p < 0.001 ? '<0.001' : p.toFixed(3)
}

/** One-line reading of a coefficient in business terms. */
export function interpret(m: DriverModel, term: DriverTerm, grain: Grain) {
  const lag = term.lag ? ` ${term.lag} ${grain}${term.lag > 1 ? 's' : ''} later` : ''
  if (m.type === 'change' && m.targetTransform === 'log' && term.transform === 'log') {
    const eff = (1.1 ** term.coef - 1) * 100
    return `A 10% rise in ${term.label} goes with ${eff >= 0 ? '+' : ''}${eff.toFixed(2)}% ${m.targetLabel}${lag}.`
  }
  if (m.type === 'change' && m.targetTransform === 'log' && term.transform === 'raw') {
    const eff = (Math.exp(term.coef) - 1) * 100
    return `+1 in ${term.label} goes with ${eff >= 0 ? '+' : ''}${eff.toFixed(3)}% ${m.targetLabel}${lag}.`
  }
  if (m.type === 'change' && term.transform === 'logit')
    return `Effect is measured on the log-odds of ${term.label}; Scenario converts it for you.`
  return `+1 in ${term.label} goes with ${term.coef >= 0 ? '+' : ''}${fmtCoef(term.coef)} ${m.targetLabel}${lag}.`
}

function LagScan({ term, onUse }: { term: DriverTerm; onUse: (lag: number) => void }) {
  const best = [...term.lagScan].filter((s) => Number.isFinite(s.r)).sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0]
  const max = Math.max(0.01, ...term.lagScan.map((s) => (Number.isFinite(s.r) ? Math.abs(s.r) : 0)))
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-7 items-end gap-0.5" aria-label="Correlation by lag">
        {term.lagScan.map((s) => (
          <div
            key={s.lag}
            title={`lag ${s.lag}: r = ${Number.isFinite(s.r) ? s.r.toFixed(3) : 'n/a'}`}
            className={clsx('w-2 rounded-sm', s.lag === term.lag ? 'bg-accent' : s.lag === best?.lag ? 'bg-ink/50' : 'bg-line')}
            style={{ height: `${Math.max(8, ((Number.isFinite(s.r) ? Math.abs(s.r) : 0) / max) * 100)}%` }}
          />
        ))}
      </div>
      {best && best.lag !== term.lag && (
        <button type="button" onClick={() => onUse(best.lag)} className="text-[11px] whitespace-nowrap text-accent hover:underline">
          use lag {best.lag}
        </button>
      )}
    </div>
  )
}

function FitChart({ m }: { m: DriverModel }) {
  const pts = m.fitTail
  if (pts.length < 3) return null
  const W = 560
  const H = 120
  const vals = pts.flatMap((p) => [p.actual, p.fitted])
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const span = hi - lo || 1
  const x = (i: number) => (i / (pts.length - 1)) * W
  const y = (v: number) => H - 4 - ((v - lo) / span) * (H - 8)
  const line = (get: (p: (typeof pts)[number]) => number) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(get(p)).toFixed(1)}`).join('')
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label="Actual versus fitted">
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="stroke-line" strokeDasharray="3 3" />
        <path d={line((p) => p.actual)} fill="none" className="stroke-faint" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={line((p) => p.fitted)} fill="none" className="stroke-accent" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-faint" />
          actual {m.type === 'change' ? 'change' : 'value'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-accent" />
          fitted
        </span>
        <span className="ml-auto">
          last {pts.length} {pts.length ? 'periods' : ''} · {pts[0].date} → {pts.at(-1)!.date}
        </span>
      </figcaption>
    </figure>
  )
}

function ModelCard({ tree, m }: { tree: Tree; m: DriverModel }) {
  const { updateNode, updateEdge } = useTrees.getState()
  const y = m.type === 'change' ? `Δ${scaled(m.targetTransform, m.targetLabel)}` : m.targetLabel
  const wf = m.walkForward
  return (
    <article className="rounded-2xl border border-line bg-surface">
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{m.targetLabel}</h2>
          <p className="text-sm text-muted">
            Fitted from {m.terms.length} driver{m.terms.length > 1 ? 's' : ''} on {m.n} {tree.grain}s ({m.firstDate} → {m.lastDate})
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          Model
          <Select value={m.type} onChange={(e) => updateNode(m.targetId, { modelType: e.target.value as ModelType })}>
            <option value="change">Change (elasticity)</option>
            <option value="level">Level (raw values)</option>
          </Select>
        </label>
      </header>

      <div className="space-y-5 px-5 py-4">
        <p className="overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-[12.5px] whitespace-nowrap">
          {y} = {fmtCoef(m.intercept)}
          {m.terms.map((t) => (
            <span key={t.edgeId}>
              {' '}
              {t.coef < 0 ? '−' : '+'} {fmtCoef(Math.abs(t.coef))} × {m.type === 'change' ? 'Δ' : ''}
              {scaled(t.transform, t.label)}
              {t.lag ? `[t−${t.lag}]` : ''}
            </span>
          ))}
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="R² (in-sample)" value={m.r2.toFixed(3)} />
          <Stat label="Out-of-sample R²" value={wf ? wf.r2.toFixed(3) : '—'} hint={wf ? `${wf.folds} walk-forward folds` : 'not enough history'} />
          <Stat label="Direction right" value={wf ? `${(wf.directionHit * 100).toFixed(0)}%` : '—'} hint="of held-out periods" />
          <Stat label="Typical error" value={wf ? fmtCoef(wf.mae) : fmtCoef(m.residSd)} hint={m.type === 'change' ? 'on the change scale' : 'in target units'} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Driver</th>
                <th className="px-3 py-2 font-medium">Effect</th>
                <th className="px-3 py-2 font-medium">p-value</th>
                <th className="px-3 py-2 font-medium">VIF</th>
                <th className="px-3 py-2 font-medium">Expected</th>
                <th className="px-3 py-2 font-medium">Lag</th>
                <th className="py-2 pl-3 font-medium">Correlation by lag 0–7</th>
              </tr>
            </thead>
            <tbody>
              {m.terms.map((t) => (
                <tr key={t.edgeId} className="border-b border-line align-top last:border-0">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium">{t.label}</div>
                    <div className="max-w-64 text-xs text-muted">{interpret(m, t, tree.grain)}</div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap tabular">
                    {fmtCoef(t.coef)} <span className="text-faint">± {fmtCoef(1.96 * t.se)}</span>
                  </td>
                  <td className={clsx('px-3 py-2.5 font-mono text-xs tabular', t.p < 0.05 ? 'text-up' : t.p < 0.1 ? 'text-warn' : 'text-down')}>{pLabel(t.p)}</td>
                  <td className={clsx('px-3 py-2.5 font-mono text-xs tabular', t.vif > 5 && 'text-warn')}>{Number.isFinite(t.vif) ? t.vif.toFixed(2) : '∞'}</td>
                  <td className="px-3 py-2.5 text-xs">
                    {!t.expectedSign ? (
                      <span className="text-faint">—</span>
                    ) : t.signMismatch ? (
                      <span className="inline-flex items-center gap-1 text-down">
                        <X className="size-3.5" />
                        {t.expectedSign === 'positive' ? '↑' : '↓'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-up">
                        <Check className="size-3.5" />
                        {t.expectedSign === 'positive' ? '↑' : '↓'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs tabular">{t.lag}</td>
                  <td className="py-2.5 pl-3">
                    <LagScan term={t} onUse={(lag) => updateEdge(t.edgeId, { lag: lag || undefined })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <FitChart m={m} />

        {m.warnings.length > 0 && (
          <ul className="space-y-1">
            {m.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs">
                <AlertTriangle className="mt-px size-3.5 shrink-0 text-warn" />
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="font-mono text-lg tabular">{value}</div>
      {hint && <div className="text-[10.5px] text-faint">{hint}</div>}
    </div>
  )
}

function Analyze({ tree }: { tree: Tree }) {
  const model = useTreeModel(tree)
  const setGrain = useTrees((s) => s.setGrain)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const fits = [...model.models.values()]
  const ok = fits.filter((f): f is DriverModel => f.ok)
  const failed = fits.filter((f) => !f.ok)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <header className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Models · {tree.name}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Each card with <span style={{ color: 'var(--e-driver)' }}>model-driver</span> links is fitted with linear regression on its history.
              Change models compare period-over-period moves on a log scale, which reads as elasticity and is robust to trends.
            </p>
          </div>
          <Segmented<Grain>
            size="sm"
            value={tree.grain}
            onChange={setGrain}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
        </header>

        {fits.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
            <GitBranch className="mx-auto size-6 text-faint" />
            <p className="mt-3 font-semibold">No model drivers yet</p>
            <p className="mt-1 text-sm text-muted">In Build, link a metric to the metric it drives and choose “Model driver”.</p>
            <Button className="mt-4" onClick={() => setWorkspace('build')}>
              Open Build
              <ArrowRight className="size-4" />
            </Button>
          </div>
        )}

        {failed.map((f) => (
          <div key={f.targetId} className="flex items-start gap-3 rounded-2xl border border-down/30 bg-down-soft px-5 py-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-down" />
            <div>
              <div className="font-semibold">{f.targetLabel}: model not fitted</div>
              <div className="text-sm">{!f.ok && f.error}</div>
            </div>
          </div>
        ))}

        {ok.map((m) => (
          <ModelCard key={m.targetId} tree={tree} m={m} />
        ))}

        {ok.length > 0 && (
          <p className="text-xs text-faint">
            Regression shows association in your history, not proof of cause. A p-value above 0.1 or a VIF above 5 is flagged. Scenario
            uses each effect at steady state, after its lag.
          </p>
        )}
      </div>
    </div>
  )
}

export function AnalyzeWorkspace() {
  const tree = useTrees(activeTree)
  const setWorkspace = useStore((s) => s.setWorkspace)
  if (!tree)
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="font-semibold">No tree yet</p>
          <Button className="mt-3" onClick={() => setWorkspace('build')}>
            Create one in Build
          </Button>
        </div>
      </div>
    )
  return <Analyze tree={tree} />
}
