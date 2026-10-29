import { ReactFlowProvider } from '@xyflow/react'
import { clsx } from 'clsx'
import { AlertTriangle, ChevronDown, Copy, Plus, RotateCcw, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Grain } from '../../data/types'
import { formatChange, formatValue } from '../../lib/format'
import { TRANSFORM_LABEL, type DriverModel } from '../../model/drivers'
import { modelStep, parseChange, runScenario, substitute, type ScenarioResult } from '../../model/scenario'
import { activeScenario, activeTree, useTrees } from '../../state/trees'
import { kindOf, type AdjustmentKind, type Assumption, type Scenario, type Tree } from '../../tree/types'
import { StartTree } from '../build/BuildWorkspace'
import { Canvas } from '../build/Canvas'
import { Evidence } from './Evidence'
import { useTreeModel, type TreeModel } from '../build/useTreeModel'
import { Button, Select } from '../primitives'

const WINDOWS: Record<Grain, number[]> = { day: [1, 7, 28, 90], week: [1, 4, 13], month: [1, 3, 12] }

function Section({ n, title, aside, children, className }: { n?: number; title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx('border-b border-line px-5 py-4', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          {n !== undefined && <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] text-accent-ink tabular">{n}</span>}
          {title}
        </h3>
        {aside && <span className="text-[11px] text-faint">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-surface-2" aria-expanded={open}>
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <ChevronDown className={clsx('size-4 text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </section>
  )
}

export function ScenarioWorkspace() {
  const tree = useTrees(activeTree)
  const ensureScenario = useTrees((s) => s.ensureScenario)
  useEffect(() => {
    if (tree && !activeScenario(tree)) ensureScenario()
  }, [tree, ensureScenario])
  if (!tree)
    return (
      <StartTree />
    )
  const scenario = activeScenario(tree)
  if (!scenario) return null
  return (
    <ReactFlowProvider key={tree.id}>
      <ScenarioView tree={tree} scenario={scenario} />
    </ReactFlowProvider>
  )
}

function ScenarioView({ tree, scenario }: { tree: Tree; scenario: Scenario }) {
  const model = useTreeModel(tree)
  const result = useMemo(
    () => runScenario(tree, model.series, model.models, scenario.assumptions, scenario.baselineWindow),
    [tree, model, scenario.assumptions, scenario.baselineWindow],
  )
  return (
    <div className="flex min-h-0 flex-1">
      <div className="contour relative min-w-0 flex-1">
        {scenario.assumptions.length > 0 && (
          <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-full bg-ink px-3 py-1 text-xs font-medium text-bg shadow">
            {scenario.name}: green cards go up, red go down
          </div>
        )}
        <Canvas tree={tree} model={model} scenario={result} />
      </div>
      <Planner tree={tree} scenario={scenario} model={model} result={result} />
    </div>
  )
}

function Planner({ tree, scenario, model, result }: { tree: Tree; scenario: Scenario; model: TreeModel; result: ScenarioResult }) {
  const { setOutcome, setBaselineWindow } = useTrees.getState()
  const errors = model.issues.filter((i) => i.level === 'error')
  const fmtOf = (id: string) => model.series.byNode.get(id)?.format

  return (
    <aside className="flex w-[440px] shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-line bg-surface">
      <div className="border-b border-line px-5 pt-4 pb-3">
        <div className="text-[13px] font-semibold text-accent">Forecast</div>
        <h2 className="mt-0.5 text-lg font-semibold">Change an input, follow it to the outcome</h2>
        {errors.length > 0 && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-down-soft px-3 py-2 text-xs">
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-down" />
            The tree has {errors.length} error{errors.length > 1 ? 's' : ''}. Fix them in Build for reliable results.
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted">Outcome to estimate</span>
            <Select value={tree.outcomeId ?? ''} onChange={(e) => setOutcome(e.target.value || undefined)} className="w-full">
              <option value="">Choose…</option>
              {tree.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted">Baseline</span>
            <Select value={scenario.baselineWindow} onChange={(e) => setBaselineWindow(Number(e.target.value))} className="w-full">
              {[...new Set([...WINDOWS[tree.grain], scenario.baselineWindow])]
                .sort((a, b) => a - b)
                .map((w) => (
                  <option key={w} value={w}>
                    {w === 1 ? `Latest ${tree.grain}` : `Average of last ${w} ${tree.grain}s`}
                  </option>
                ))}
            </Select>
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[11px] text-faint">Values per {tree.grain}</span>
          {result.baseline.from && (
            <span className="text-[11px] text-faint tabular">
              baseline {result.baseline.from === result.baseline.to ? result.baseline.from : `${result.baseline.from} → ${result.baseline.to}`}
            </span>
          )}
        </div>
      </div>

      <DescribeChange tree={tree} />
      <OutcomeEstimate tree={tree} result={result} fmtOf={fmtOf} />
      <Section n={3} title="Statistical evidence" aside="supports the decision">
        <Evidence tree={tree} model={model} result={result} />
      </Section>
      <InputControls tree={tree} scenario={scenario} model={model} result={result} fmtOf={fmtOf} />
      <ScenarioManager tree={tree} scenario={scenario} model={model} fmtOf={fmtOf} />
      {result.path.length > 0 && <Drivers tree={tree} result={result} fmtOf={fmtOf} />}
      {result.path.length > 0 && (
        <Collapsible title="How it was calculated">
          <Trace tree={tree} model={model} result={result} fmtOf={fmtOf} />
        </Collapsible>
      )}
      <p className="mt-auto px-5 py-3 text-[11px] leading-4 text-faint">
        Forecasts are estimates and never change your data. Formula links are exact; model-driver links use effects learned from your history, at
        steady state after any lag.
      </p>
    </aside>
  )
}

function DescribeChange({ tree }: { tree: Tree }) {
  const setAssumption = useTrees((s) => s.setAssumption)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const driverSource = tree.edges.find((e) => e.role === 'driver')?.source
  const firstInput = tree.nodes.find((n) => n.id === driverSource) ?? tree.nodes.find((n) => kindOf(n) === 'metric')
  // One-click starters built from this tree's own inputs.
  const inputs = tree.edges.filter((e) => e.role === 'driver').map((e) => tree.nodes.find((n) => n.id === e.source)!).filter(Boolean)
  const others = tree.nodes.filter((n) => kindOf(n) === 'metric' && n.id !== tree.outcomeId && !inputs.includes(n))
  const examples = [...new Set([...inputs, ...others].map((n) => n.label))].slice(0, 3).map((l, i) => (i === 1 ? `${l} -10%` : `${l} +20%`))
  const apply = (input = text) => {
    const r = parseChange(input, tree)
    if (!r.ok) return setMsg({ ok: false, text: r.error })
    const { nodeId: _n, ...a } = r.assumption
    setAssumption(r.assumption.nodeId, a)
    const n = tree.nodes.find((x) => x.id === r.assumption.nodeId)
    const pctCard = n?.format === 'percent'
    const v = r.assumption.value
    const desc =
      a.kind === 'pct' ? `${v > 0 ? '+' : ''}${v}%` : a.kind === 'add' ? `${v > 0 ? '+' : ''}${pctCard ? `${(v * 100).toFixed(2)} pts` : v}` : `set to ${pctCard ? `${(v * 100).toFixed(2)}%` : v}`
    setMsg({ ok: true, text: `Applied ${r.label} ${desc}. Adjust it below under Inputs.` })
    setText('')
  }
  return (
    <Section n={1} title="Describe the change" aside="plain English">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          apply()
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`e.g. increase ${firstInput?.label ?? 'Ad Spend'} 20%…`}
          name="change"
          autoComplete="off"
          aria-label="Describe the change"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent"
        />
        <Button type="submit" variant="primary" disabled={!text.trim()}>
          <Wand2 className="size-4" />
          Apply
        </Button>
      </form>
      {msg && <p className={clsx('mt-2 text-xs', msg.ok ? 'text-up' : 'text-down')}>{msg.text}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-faint">Try</span>
        {examples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => apply(ex)}
            className="press rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11.5px] text-ink hover:border-accent hover:text-accent"
          >
            {ex}
          </button>
        ))}
      </div>
    </Section>
  )
}

function OutcomeEstimate({ tree, result, fmtOf }: { tree: Tree; result: ScenarioResult; fmtOf: FmtOf }) {
  const outcomeNode = tree.nodes.find((n) => n.id === tree.outcomeId)
  const o = result.outcome
  if (!outcomeNode || !o)
    return (
      <Section n={2} title="Outcome estimate">
        <p className="text-sm text-muted">Choose the outcome above, e.g. Revenue or Profit, to see the estimate.</p>
      </Section>
    )
  const fmt = fmtOf(outcomeNode.id)
  const up = o.delta >= 0
  const evidence = {
    'no-change': 'No change applied yet',
    none: 'This change doesn’t reach the outcome through calculating links',
    formula: 'Exact formulas only',
    model: 'Exact formulas and effects learned from history',
  }[result.evidence]
  return (
    <Section n={2} title="Outcome estimate" aside={`per ${tree.grain}`}>
      <div className="rounded-[20px] bg-ink p-5 text-bg shadow-[0_18px_40px_-24px_rgb(23_35_56/0.7)]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-bg/70">{outcomeNode.label}</span>
          {o.affected && (
            <span className={clsx('rounded-full px-2.5 py-0.5 text-[13px] font-semibold text-white tabular', up ? 'bg-up' : 'bg-down')}>
              {formatChange(o.pct)}
            </span>
          )}
        </div>
        <div key={o.value} className="value-in mt-2 font-display text-[40px] leading-none">
          {formatValue(o.value, fmt)}
        </div>
        <p className="mt-2 text-[13px] text-bg/70 tabular">
          {o.affected ? (
            <>
              from {formatValue(o.base, fmt)}, {up ? 'up' : 'down'} {formatValue(Math.abs(o.delta), fmt)}
            </>
          ) : (
            <>baseline, nothing changed yet</>
          )}
        </p>
        {result.range && (
          <div className="mt-4 border-t border-bg/15 pt-3">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-bg/70">Likely range</span>
              <span className="tabular">
                {formatValue(result.range.p5, fmt)} to {formatValue(result.range.p95, fmt)}
              </span>
            </div>
            <RangeBar base={o.base} value={o.value} p5={result.range.p5} p95={result.range.p95} />
            <p className="mt-1.5 text-[11.5px] text-bg/55">9 in 10 outcomes fall in this band, based on how certain each learned effect is.</p>
          </div>
        )}
        <p className="mt-3 border-t border-bg/15 pt-3 text-[12px] text-bg/70">{evidence}</p>
      </div>
    </Section>
  )
}

function RangeBar({ base, value, p5, p95 }: { base: number; value: number; p5: number; p95: number }) {
  const lo = Math.min(base, p5, value)
  const hi = Math.max(base, p95, value)
  const span = hi - lo || 1
  const pos = (v: number) => `${((v - lo) / span) * 100}%`
  return (
    <div className="relative mt-2.5 h-4" aria-hidden>
      <div className="absolute top-[7px] h-0.5 w-full rounded bg-bg/15" />
      <div className="absolute top-[5px] h-1.5 rounded-full bg-accent" style={{ left: pos(p5), width: `calc(${pos(p95)} - ${pos(p5)})` }} />
      <div className="absolute top-0.5 h-3 w-px bg-bg/50" style={{ left: pos(base) }} title="baseline" />
      <div className="absolute top-0 size-4 -translate-x-1/2 rounded-full border-2 border-ink bg-bg" style={{ left: pos(value) }} title="forecast" />
    </div>
  )
}

type FmtOf = (id: string) => 'percent' | 'number' | undefined

const KIND_LABEL: Record<AdjustmentKind, string> = { pct: 'Change by %', add: 'Add amount', set: 'Set to' }

function InputRow({ tree, nodeId, base, assumption, fmt }: { tree: Tree; nodeId: string; base: number | undefined; assumption?: Assumption; fmt: ReturnType<FmtOf> }) {
  const setAssumption = useTrees((s) => s.setAssumption)
  const node = tree.nodes.find((n) => n.id === nodeId)!
  const pctCard = fmt === 'percent'
  const [kind, setKind] = useState<AdjustmentKind>(assumption?.kind ?? 'pct')
  // Show percent cards' absolute values in percentage points.
  const toDisplay = (a?: Assumption) => (!a ? '' : a.kind !== 'pct' && pctCard ? String(+(a.value * 100).toFixed(4)) : String(a.value))
  const [text, setText] = useState(toDisplay(assumption))
  useEffect(() => {
    setKind(assumption?.kind ?? 'pct')
    setText(toDisplay(assumption))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assumption?.kind, assumption?.value])

  const commit = (k: AdjustmentKind, t: string) => {
    const v = Number(t)
    if (t.trim() === '' || !Number.isFinite(v)) return setAssumption(nodeId, null)
    setAssumption(nodeId, { kind: k, value: k !== 'pct' && pctCard ? v / 100 : v })
  }
  const unit = kind === 'pct' ? '%' : pctCard ? (kind === 'set' ? '%' : 'pts') : ''
  return (
    <div className={clsx('rounded-lg border p-2.5', assumption ? 'border-accent/50 bg-accent-soft/40' : 'border-line')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{node.label}</span>
        <span className="text-[11px] text-muted tabular">baseline {formatValue(base, fmt)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Select
          value={kind}
          onChange={(e) => {
            const k = e.target.value as AdjustmentKind
            setKind(k)
            if (text.trim()) commit(k, text)
          }}
          className="h-7 text-xs"
        >
          {(Object.keys(KIND_LABEL) as AdjustmentKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
        <div className="relative flex-1">
          <input
            inputMode="decimal"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              commit(kind, e.target.value)
            }}
            placeholder={kind === 'pct' ? '0' : kind === 'set' ? formatValue(base, fmt) : '0'}
            aria-label={`${node.label} ${KIND_LABEL[kind]}`}
            className="h-7 w-full rounded-md border border-line bg-surface px-2 pr-8 text-xs outline-none focus:border-accent"
          />
          {unit && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11px] text-faint">{unit}</span>}
        </div>
        {assumption && (
          <button type="button" onClick={() => setAssumption(nodeId, null)} className="rounded p-1 text-faint hover:text-down" aria-label={`Clear ${node.label}`}>
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function InputControls({ tree, scenario, model, result, fmtOf }: { tree: Tree; scenario: Scenario; model: TreeModel; result: ScenarioResult; fmtOf: FmtOf }) {
  const clearAssumptions = useTrees((s) => s.clearAssumptions)
  const [showAll, setShowAll] = useState(false)
  const assumed = new Map(scenario.assumptions.map((a) => [a.nodeId, a]))
  const metricNodes = tree.nodes.filter((n) => kindOf(n) === 'metric' && result.baseline.value.has(n.id))
  // Inputs: no calculation flowing in. Calculated-by-model cards can be overridden under "Advanced".
  const inputs = metricNodes.filter((n) => !model.models.get(n.id)?.ok)
  const modelled = metricNodes.filter((n) => model.models.get(n.id)?.ok)
  // Inputs that reach the outcome first, then the rest.
  const sorted = [...inputs].sort((a, b) => Number(assumed.has(b.id)) - Number(assumed.has(a.id)))
  const visible = showAll ? sorted : sorted.filter((n, i) => assumed.has(n.id) || i < 4)

  return (
    <>
      <Section
        n={4}
        title="Inputs you can change"
        aside={
          scenario.assumptions.length > 0 ? (
            <button type="button" onClick={clearAssumptions} className="inline-flex items-center gap-1 text-accent hover:underline">
              <RotateCcw className="size-3" />
              Reset
            </button>
          ) : undefined
        }
      >
        <div className="space-y-2">
          {visible.map((n) => (
            <InputRow key={n.id} tree={tree} nodeId={n.id} base={result.baseline.value.get(n.id)} assumption={assumed.get(n.id)} fmt={fmtOf(n.id)} />
          ))}
        </div>
        {sorted.length > visible.length && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-2 w-full rounded-lg py-1.5 text-xs text-accent hover:bg-surface-2">
            Show all {sorted.length} inputs ({sorted.length - visible.length} hidden)
          </button>
        )}
        {inputs.length === 0 && <p className="text-sm text-muted">No input cards with data yet. Add metric cards in Build.</p>}
      </Section>
      {modelled.length > 0 && (
        <Collapsible title="Override a learned estimate" defaultOpen={modelled.some((n) => assumed.has(n.id))}>
          <p className="mb-2 text-[11px] text-faint">Setting one of these replaces its model estimate with your own number.</p>
          <div className="space-y-2">
            {modelled.map((n) => (
              <InputRow key={n.id} tree={tree} nodeId={n.id} base={result.baseline.value.get(n.id)} assumption={assumed.get(n.id)} fmt={fmtOf(n.id)} />
            ))}
          </div>
        </Collapsible>
      )}
    </>
  )
}

function ScenarioManager({ tree, scenario, model, fmtOf }: { tree: Tree; scenario: Scenario; model: TreeModel; fmtOf: FmtOf }) {
  const { addScenario, selectScenario, renameScenario, deleteScenario } = useTrees.getState()
  const scenarios = tree.scenarios ?? []
  const outcomeFmt = tree.outcomeId ? fmtOf(tree.outcomeId) : undefined
  const compare = useMemo(
    () =>
      scenarios.map((s) => ({
        s,
        r: runScenario(tree, model.series, model.models, s.assumptions, s.baselineWindow, 0).outcome,
      })),
    [scenarios, tree, model],
  )
  return (
    <Section title="Scenarios" aside="saved with the tree">
      <div className="flex flex-wrap items-center gap-1.5">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => selectScenario(s.id)}
            className={clsx('rounded-lg px-2.5 py-1 text-xs font-medium ring-1', s.id === scenario.id ? 'bg-ink text-bg ring-ink' : 'ring-line hover:bg-surface-2')}
          >
            {s.name}
            {s.assumptions.length > 0 && <span className="ml-1.5 opacity-60 tabular">{s.assumptions.length}</span>}
          </button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => addScenario(false)} title="New empty scenario" aria-label="New scenario">
          <Plus className="size-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => addScenario(true)} title="Duplicate this scenario" aria-label="Duplicate scenario">
          <Copy className="size-3.5" />
        </Button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={scenario.name}
          onChange={(e) => renameScenario(e.target.value)}
          aria-label="Scenario name"
          name="scenario-name"
          autoComplete="off"
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-sm outline-none focus:border-accent"
        />
        {scenarios.length > 1 && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => confirm(`Delete scenario “${scenario.name}”?`) && deleteScenario(scenario.id)}
            title="Delete scenario"
            aria-label="Delete scenario"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      {scenarios.length > 1 && tree.outcomeId && (
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 font-medium">Compare</th>
              <th className="py-1 text-right font-medium">Outcome</th>
              <th className="py-1 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {compare.map(({ s, r }) => (
              <tr key={s.id} className={clsx('border-t border-line', s.id === scenario.id && 'font-semibold')}>
                <td className="py-1.5">{s.name}</td>
                <td className="py-1.5 text-right tabular">{formatValue(r?.value, outcomeFmt)}</td>
                <td className={clsx('py-1.5 text-right tabular', r && r.delta > 0 ? 'text-up' : r && r.delta < 0 ? 'text-down' : 'text-muted')}>
                  {r?.affected ? formatChange(r.pct) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

function Drivers({ tree, result, fmtOf }: { tree: Tree; result: ScenarioResult; fmtOf: FmtOf }) {
  const outcomeFmt = tree.outcomeId ? fmtOf(tree.outcomeId) : undefined
  const max = Math.max(1e-12, ...result.contributions.map((c) => Math.abs(c.delta)))
  return (
    <Section n={5} title="What drove the change" aside="each change alone, then the path">
      {result.contributions.length > 0 && (
        <div className="space-y-2">
          {result.contributions.map((c, i) => (
            <div key={i}>
              <div className="flex justify-between text-xs">
                <span className={clsx(!c.nodeId && 'text-muted italic')}>{c.label}</span>
                <span className={clsx('tabular', c.delta >= 0 ? 'text-up' : 'text-down')}>
                  {c.delta >= 0 ? '+' : ''}
                  {formatValue(c.delta, outcomeFmt)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-surface-2">
                <div className={clsx('h-1.5 rounded', c.delta >= 0 ? 'bg-up' : 'bg-down')} style={{ width: `${(Math.abs(c.delta) / max) * 100}%` }} />
              </div>
            </div>
          ))}
          <p className="text-[10.5px] text-faint">These add up exactly to the total outcome change.</p>
        </div>
      )}
      <ol className="mt-4 space-y-1">
        {result.path.map((id, i) => {
          const r = result.nodes.get(id)!
          const n = tree.nodes.find((x) => x.id === id)!
          const fmt = fmtOf(id)
          return (
            <li key={id} className={clsx('flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm', r.delta >= 0 ? 'bg-accent-soft/50' : 'bg-down-soft/70', id === tree.outcomeId && 'ring-1 ring-accent')}>
              <span className="w-4 text-xs text-faint">{i + 1}</span>
              <span className={clsx('text-xs', r.delta >= 0 ? 'text-up' : 'text-down')}>{r.delta >= 0 ? '↑' : '↓'}</span>
              <span className="min-w-0 flex-1 truncate">{n.label}</span>
              <span className="text-[10px] text-faint">{r.how === 'input' ? 'input' : r.how}</span>
              <span className={clsx('w-20 text-right text-xs tabular', r.delta >= 0 ? 'text-up' : 'text-down')}>
                {r.delta >= 0 ? '+' : ''}
                {formatValue(r.delta, fmt)}
              </span>
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

function Trace({ tree, model, result, fmtOf }: { tree: Tree; model: TreeModel; result: ScenarioResult; fmtOf: FmtOf }) {
  const baseVals = result.baseline.value
  const newVals = new Map([...result.nodes].map(([id, r]) => [id, r.value]))
  const f = (id: string, v: number) => formatValue(v, fmtOf(id))
  const pretty = (s: string) => s.replace(/\*/g, '×').replace(/(\s)-(\s)/g, '$1−$2')
  return (
    <div className="space-y-4">
      {result.path.map((id) => {
        const n = tree.nodes.find((x) => x.id === id)!
        const r = result.nodes.get(id)!
        if (r.how === 'input')
          return (
            <div key={id} className="text-xs">
              <div className="font-semibold">{n.label}</div>
              <div className="font-mono text-muted tabular">
                your change: {f(id, r.base)} → {f(id, r.value)} ({formatChange(r.pct)})
              </div>
            </div>
          )
        if (r.how === 'formula')
          return (
            <div key={id} className="text-xs">
              <div className="font-semibold">
                {n.label} = <span className="font-mono font-normal">{pretty(n.formula ?? '')}</span>
              </div>
              <div className="mt-1 font-mono text-muted tabular">
                baseline: {pretty(substitute(n.formula ?? '', tree, baseVals, f))} = {f(id, r.base)}
              </div>
              <div className="font-mono tabular">
                scenario: {pretty(substitute(n.formula ?? '', tree, newVals, f))} = {f(id, r.value)}
              </div>
              {result.baseline.actual.has(id) && (
                <div className="font-mono text-faint tabular">reported actual over baseline: {f(id, result.baseline.actual.get(id)!)}</div>
              )}
            </div>
          )
        const m = model.models.get(id) as DriverModel
        const step = modelStep(m, r.base, baseVals, newVals)
        const tl = TRANSFORM_LABEL[m.targetTransform]
        return (
          <div key={id} className="text-xs">
            <div className="font-semibold">
              {n.label} <span className="font-normal text-muted">learned from {m.n} {tree.grain}s, explains {(m.r2 * 100).toFixed(0)}%</span>
            </div>
            <div className="mt-1 space-y-0.5 font-mono tabular">
              {step.parts
                .filter((p) => p.dx !== 0)
                .map((p) => {
                  const t = TRANSFORM_LABEL[p.term.transform]
                  const dx = m.type === 'change' && t ? `${t}(${f(p.term.sourceId, p.to)}) − ${t}(${f(p.term.sourceId, p.from)})` : `${f(p.term.sourceId, p.to)} − ${f(p.term.sourceId, p.from)}`
                  return (
                    <div key={p.term.edgeId}>
                      {p.term.label}: {dx} = {p.dx.toFixed(5)} × {p.coef.toFixed(4)} = <span className={p.contribution >= 0 ? 'text-up' : 'text-down'}>{p.contribution.toFixed(5)}</span>
                    </div>
                  )
                })}
              <div className="text-muted">
                {m.type === 'change' && tl
                  ? `${n.label} = ${m.targetTransform === 'log' ? 'exp' : 'inv-logit'}(${tl}(${f(id, r.base)}) + ${step.dz.toFixed(5)}) = ${f(id, step.value)}`
                  : `${n.label} = ${f(id, r.base)} + ${step.dz.toFixed(4)} = ${f(id, step.value)}`}
              </div>
            </div>
          </div>
        )
      })}
      <p className="flex items-start gap-1.5 text-[11px] text-faint">
        <Sparkles className="mt-px size-3 shrink-0" />
        The model intercept (background drift) is left out, so an unchanged input always gives back the baseline.
      </p>
    </div>
  )
}
