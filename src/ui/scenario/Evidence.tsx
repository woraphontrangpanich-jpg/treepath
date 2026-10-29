import { clsx } from 'clsx'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { TRANSFORM_LABEL, type DriverModel } from '../../model/drivers'
import type { ScenarioResult } from '../../model/scenario'
import type { Tree } from '../../tree/types'
import { interpret } from '../build/ModelInfo'
import type { TreeModel } from '../build/useTreeModel'

export function pText(p: number) {
  return p < 0.001 ? '< 0.001' : p.toFixed(3)
}

/** Conventional significance reading of a p-value. */
export function significance(p: number): { label: string; stars: string; tone: 'up' | 'warn' | 'down' } {
  if (p < 0.001) return { label: 'Highly significant', stars: '***', tone: 'up' }
  if (p < 0.01) return { label: 'Very significant', stars: '**', tone: 'up' }
  if (p < 0.05) return { label: 'Significant', stars: '*', tone: 'up' }
  if (p < 0.1) return { label: 'Weak', stars: '', tone: 'warn' }
  return { label: 'Not significant', stars: '', tone: 'down' }
}

function num(v: number) {
  const a = Math.abs(v)
  if (a !== 0 && (a < 0.0001 || a >= 1e5)) return v.toExponential(2)
  return v.toFixed(a < 0.01 ? 5 : a < 1 ? 3 : 2)
}

/**
 * The statistics behind each learned effect the forecast relies on: enough to judge
 * whether the evidence supports acting on it.
 */
export function Evidence({ tree, model, result }: { tree: Tree; model: TreeModel; result: ScenarioResult }) {
  // Models on the changed path first, then any other fitted models in the tree.
  const used = result.modelsUsed.map((id) => model.models.get(id)).filter((m): m is DriverModel => !!m?.ok)
  const others = [...model.models.values()].filter((m): m is DriverModel => m.ok && !result.modelsUsed.includes(m.targetId))
  const list = used.length ? used : others
  if (list.length === 0)
    return (
      <p className="text-sm text-muted">
        {result.evidence === 'formula' ? 'This forecast uses exact formulas only, so no statistics are needed.' : 'No learned effects in this tree yet.'}
      </p>
    )
  return (
    <div className="space-y-4">
      {!used.length && <p className="text-xs text-muted">Nothing learned is on the changed path yet; showing the tree’s models.</p>}
      {list.map((m) => (
        <ModelEvidence key={m.targetId} tree={tree} m={m} result={result} active={used.includes(m)} />
      ))}
      <p className="text-[11px] leading-4 text-faint">
        Coefficients are on the change scale ({TRANSFORM_LABEL.log} = log change, so they read as elasticities). p is the chance of an effect this
        large if there were really none. *** p &lt; 0.001, ** p &lt; 0.01, * p &lt; 0.05.
      </p>
    </div>
  )
}

function ModelEvidence({ tree, m, result, active }: { tree: Tree; m: DriverModel; result: ScenarioResult; active: boolean }) {
  const movedSources = new Set(m.terms.filter((t) => result.nodes.get(t.sourceId)?.affected).map((t) => t.sourceId))
  const weakMoved = m.terms.filter((t) => movedSources.has(t.sourceId) && t.p >= 0.05)
  const df1 = m.terms.length
  const df2 = m.n - m.terms.length - 1
  const fSig = significance(m.fP)
  const rows = m.keys ? `${m.n.toLocaleString()} rows (${m.keys} keys × ${tree.grain}s)` : `${m.n.toLocaleString()} ${tree.grain}s`

  return (
    <div className="rounded-xl border border-line">
      <div className="border-b border-line px-3.5 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{m.targetLabel}</span>
          <span className="text-[11.5px] text-muted">{rows}</span>
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
          <Stat label={`F(${df1}, ${df2})`} value={Number.isFinite(m.fStat) ? m.fStat.toFixed(1) : '∞'} />
          <Stat label="F p-value" value={pText(m.fP)} tone={fSig.tone} />
          <Stat label="R² (adj.)" value={`${(m.r2 * 100).toFixed(1)}% (${(m.adjR2 * 100).toFixed(1)}%)`} />
        </div>
        <p className={clsx('mt-1.5 text-[11.5px]', fSig.tone === 'up' ? 'text-up' : 'text-warn')}>
          {m.fP < 0.05 ? `The drivers together explain ${m.targetLabel} (${fSig.label.toLowerCase()}).` : `The drivers together don’t clearly explain ${m.targetLabel}.`}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] tabular">
          <thead>
            <tr className="text-left text-muted">
              <th className="px-3.5 py-1.5 font-medium">Driver</th>
              <th className="px-1.5 py-1.5 text-right font-medium">Coef.</th>
              <th className="px-1.5 py-1.5 text-right font-medium whitespace-nowrap">Std. err.</th>
              <th className="px-1.5 py-1.5 text-right font-medium">t</th>
              <th className="py-1.5 pr-3.5 pl-1.5 text-right font-medium">p-value</th>
            </tr>
          </thead>
          <tbody>
            {m.terms.map((t) => {
              const sig = significance(t.p)
              const moved = movedSources.has(t.sourceId)
              return (
                <tr key={t.edgeId} className={clsx('border-t border-line align-top', moved && 'bg-accent-soft/60')}>
                  <td className="px-3.5 py-1.5">
                    <div className="font-medium">
                      {t.label}
                      {moved && <span className="ml-1.5 text-[10.5px] font-normal text-accent">changed</span>}
                    </div>
                    <div className="text-[10.5px] text-muted">{interpret(m, t, tree.grain)}</div>
                    <div className={clsx('mt-0.5 text-[10.5px] font-semibold', sig.tone === 'up' ? 'text-up' : sig.tone === 'warn' ? 'text-warn' : 'text-down')}>{sig.label}</div>
                  </td>
                  <td className="px-1.5 py-1.5 text-right whitespace-nowrap">{num(t.coef)}</td>
                  <td className="px-1.5 py-1.5 text-right whitespace-nowrap text-muted">{num(t.se)}</td>
                  <td className="px-1.5 py-1.5 text-right whitespace-nowrap">{t.t.toFixed(1)}</td>
                  <td className={clsx('py-1.5 pr-3.5 pl-1.5 text-right font-semibold whitespace-nowrap', sig.tone === 'up' ? 'text-up' : sig.tone === 'warn' ? 'text-warn' : 'text-down')}>
                    {pText(t.p)}
                    <sup className="ml-0.5 inline-block w-3 text-left">{sig.stars}</sup>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {active && (
        <p className={clsx('flex items-start gap-1.5 border-t border-line px-3.5 py-2 text-[11.5px]', weakMoved.length ? 'text-warn' : 'text-up')}>
          {weakMoved.length ? <AlertTriangle className="mt-px size-3.5 shrink-0" /> : <CheckCircle2 className="mt-px size-3.5 shrink-0" />}
          {weakMoved.length
            ? `${weakMoved.map((t) => t.label).join(', ')} ${weakMoved.length > 1 ? 'are' : 'is'} not significant, so that part of the forecast is weakly supported. Gather more history or treat it as a guess.`
            : 'Every driver you changed has a significant effect, so the evidence supports this part of the forecast.'}
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'warn' | 'down' }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-1.5">
      <div className="text-[10.5px] text-muted">{label}</div>
      <div className={clsx('text-[13px] font-semibold tabular', tone === 'up' && 'text-up', tone === 'warn' && 'text-warn', tone === 'down' && 'text-down')}>{value}</div>
    </div>
  )
}
