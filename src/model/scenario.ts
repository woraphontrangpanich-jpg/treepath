import type { TreeSeries } from '../tree/compute'
import { evaluate } from '../tree/formula'
import { findByLabel, topoOrder, tryParse } from '../tree/graph'
import type { Assumption, Tree, TreeNode } from '../tree/types'
import { fwd, fwdSafe, inv, type DriverFit, type DriverModel } from './drivers'
import { cholesky, gaussian, quantile, rng } from './stats'

export function applyAssumption(a: Assumption, base: number) {
  if (a.kind === 'pct') return base * (1 + a.value / 100)
  if (a.kind === 'add') return base + a.value
  return a.value
}

export interface Baseline {
  /** Value used as the starting point: mean of the window for data cards, formula of those for formula cards. */
  value: Map<string, number>
  /** Reported actual over the same window, for formula cards bound to data. */
  actual: Map<string, number>
  from: string | null
  to: string | null
}

function windowMean(points: { date: string; value: number }[], w: number) {
  const tail = points.slice(-Math.max(1, w))
  return tail.length ? tail.reduce((s, p) => s + p.value, 0) / tail.length : NaN
}

export function computeBaseline(tree: Tree, series: TreeSeries, window: number): Baseline {
  const value = new Map<string, number>()
  const actual = new Map<string, number>()
  let from: string | null = null
  let to: string | null = null
  const { order } = topoOrder(tree.nodes, tree.edges)
  for (const id of order) {
    const n = tree.nodes.find((x) => x.id === id)!
    const s = series.byNode.get(id)
    if (s?.actual?.length) actual.set(id, windowMean(s.actual, window))
    if (n.formula !== undefined) {
      const v = evalFormula(tree, n, value)
      if (Number.isFinite(v)) value.set(id, v)
      continue
    }
    if (s?.points.length) {
      value.set(id, windowMean(s.points, window))
      const tail = s.points.slice(-Math.max(1, window))
      if (!from || tail[0].date < from) from = tail[0].date
      if (!to || tail.at(-1)!.date > to) to = tail.at(-1)!.date
    }
  }
  return { value, actual, from, to }
}

function evalFormula(tree: Tree, n: TreeNode, values: Map<string, number>) {
  const parsed = tryParse(n.formula ?? '')
  if (!parsed.ok) return NaN
  return evaluate(parsed.ast, (name) => {
    const src = findByLabel(tree.nodes, name)
    return src ? (values.get(src.id) ?? NaN) : NaN
  })
}

/** Model-scale change contributed by each driver term, and the resulting target value. */
export function modelStep(m: DriverModel, baseTarget: number, base: Map<string, number>, values: Map<string, number>, slopes?: number[]) {
  const parts = m.terms.map((t, j) => {
    const b0 = base.get(t.sourceId) ?? NaN
    const b1 = values.get(t.sourceId) ?? b0
    const dx = m.type === 'change' ? fwdSafe(t.transform, b1) - fwdSafe(t.transform, b0) : b1 - b0
    const coef = slopes ? slopes[j] : t.coef
    return { term: t, from: b0, to: b1, dx, coef, contribution: coef * dx }
  })
  const dz = parts.reduce((s, p) => s + p.contribution, 0)
  // dz = 0 returns the baseline exactly (exp(ln x) is not always x in floating point).
  const value = dz === 0 ? baseTarget : m.type === 'change' ? inv(m.targetTransform, fwd(m.targetTransform, baseTarget) + dz) : baseTarget + dz
  return { parts, dz, value }
}

function propagate(
  tree: Tree,
  order: string[],
  base: Map<string, number>,
  models: Map<string, DriverFit>,
  assumptions: Assumption[],
  slopeDraws?: Map<string, number[]>,
): Map<string, number> {
  const values = new Map<string, number>()
  const byNode = new Map(assumptions.map((a) => [a.nodeId, a]))
  for (const id of order) {
    const b = base.get(id)
    const n = tree.nodes.find((x) => x.id === id)!
    const a = byNode.get(id)
    if (a && b !== undefined) {
      values.set(id, applyAssumption(a, b))
      continue
    }
    if (n.formula !== undefined) {
      const v = evalFormula(tree, n, values)
      if (Number.isFinite(v)) values.set(id, v)
      else if (b !== undefined) values.set(id, b)
      continue
    }
    const m = models.get(id)
    if (m?.ok && b !== undefined) {
      const v = modelStep(m, b, base, values, slopeDraws?.get(id)).value
      values.set(id, Number.isFinite(v) ? v : b)
      continue
    }
    if (b !== undefined) values.set(id, b)
  }
  return values
}

export interface NodeResult {
  base: number
  value: number
  delta: number
  pct: number | null
  affected: boolean
  how: 'input' | 'formula' | 'model' | 'unchanged'
}

export interface Contribution {
  label: string
  nodeId?: string
  delta: number
}

export interface ScenarioResult {
  baseline: Baseline
  nodes: Map<string, NodeResult>
  outcome: NodeResult | null
  /** Effect on the outcome of each assumption alone, plus any interaction left over. */
  contributions: Contribution[]
  /** P5–P95 of the outcome from coefficient uncertainty (null when only exact formulas are involved). */
  range: { p5: number; p95: number; draws: number } | null
  evidence: 'formula' | 'model' | 'none' | 'no-change'
  /** Cards in calculation order that moved. */
  path: string[]
  /** Driver models whose target moved because of the scenario. */
  modelsUsed: string[]
}

const isAffected = (base: number, v: number) => Math.abs(v - base) > 1e-9 * Math.max(1, Math.abs(base))

export function runScenario(
  tree: Tree,
  series: TreeSeries,
  models: Map<string, DriverFit>,
  assumptions: Assumption[],
  window: number,
  draws = 400,
): ScenarioResult {
  const baseline = computeBaseline(tree, series, window)
  const { order } = topoOrder(tree.nodes, tree.edges)
  const active = assumptions.filter((a) => baseline.value.has(a.nodeId))
  const values = propagate(tree, order, baseline.value, models, active)
  const byAssumption = new Set(active.map((a) => a.nodeId))

  const nodes = new Map<string, NodeResult>()
  for (const id of order) {
    const b = baseline.value.get(id)
    const v = values.get(id)
    if (b === undefined || v === undefined) continue
    const n = tree.nodes.find((x) => x.id === id)!
    const affected = isAffected(b, v)
    nodes.set(id, {
      base: b,
      value: v,
      delta: v - b,
      pct: b !== 0 ? (v - b) / Math.abs(b) : null,
      affected,
      how: !affected ? 'unchanged' : byAssumption.has(id) ? 'input' : n.formula !== undefined ? 'formula' : models.get(id)?.ok ? 'model' : 'unchanged',
    })
  }
  const path = order.filter((id) => nodes.get(id)?.affected)
  const modelsUsed = path.filter((id) => nodes.get(id)!.how === 'model')
  const outcome = tree.outcomeId ? (nodes.get(tree.outcomeId) ?? null) : null

  const contributions: Contribution[] = []
  if (outcome && active.length) {
    let sum = 0
    for (const a of active) {
      const solo = propagate(tree, order, baseline.value, models, [a]).get(tree.outcomeId!)
      const d = solo !== undefined ? solo - outcome.base : 0
      sum += d
      contributions.push({ label: tree.nodes.find((n) => n.id === a.nodeId)?.label ?? '?', nodeId: a.nodeId, delta: d })
    }
    const rest = outcome.delta - sum
    if (Math.abs(rest) > 1e-9 * Math.max(1, Math.abs(outcome.base))) contributions.push({ label: 'Combined effect (interaction)', delta: rest })
  }

  // Monte Carlo over fitted coefficients of the models on the changed path.
  let range: ScenarioResult['range'] = null
  if (outcome?.affected && modelsUsed.length) {
    const rand = rng(12345)
    const factors = new Map(
      modelsUsed.map((id) => {
        const m = models.get(id) as DriverModel
        return [id, { m, L: cholesky(m.slopeCov) }]
      }),
    )
    const outs: number[] = []
    for (let i = 0; i < draws; i++) {
      const slopeDraws = new Map<string, number[]>()
      for (const [id, { m, L }] of factors) {
        const z = m.terms.map(() => gaussian(rand))
        slopeDraws.set(
          id,
          m.terms.map((t, r) => t.coef + L[r].reduce((s, l, c) => s + l * z[c], 0)),
        )
      }
      const v = propagate(tree, order, baseline.value, models, active, slopeDraws).get(tree.outcomeId!)
      if (v !== undefined && Number.isFinite(v)) outs.push(v)
    }
    outs.sort((a, b) => a - b)
    if (outs.length) range = { p5: quantile(outs, 0.05), p95: quantile(outs, 0.95), draws: outs.length }
  }

  const evidence: ScenarioResult['evidence'] =
    active.length === 0 ? 'no-change' : !outcome?.affected ? 'none' : modelsUsed.length ? 'model' : 'formula'
  return { baseline, nodes, outcome, contributions, range, evidence, path, modelsUsed }
}

/** Substitute each reference in a formula with a formatted value, for "how it was calculated". */
export function substitute(formula: string, tree: Tree, values: Map<string, number>, fmt: (id: string, v: number) => string) {
  const sub = (name: string, raw: string) => {
    const n = findByLabel(tree.nodes, name)
    const v = n ? values.get(n.id) : undefined
    return n && v !== undefined ? fmt(n.id, v) : raw
  }
  return formula
    .replace(/\[([^\]]+)\]/g, (raw, name: string) => sub(name, raw))
    .replace(/@([A-Za-z_][\w%]*)/g, (raw, name: string) => sub(name, raw))
}

export type ParsedChange = { ok: true; assumption: Assumption; label: string } | { ok: false; error: string }

const UP = /^(increase|raise|grow|boost|lift|up|add|more)$/i
const DOWN = /^(decrease|reduce|cut|lower|drop|down|decline|less|shrink)$/i

function matchNode(tree: Tree, phrase: string): TreeNode | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, ' ').trim()
  const p = norm(phrase)
  const candidates = tree.nodes.filter((n) => n.formula === undefined && n.metric)
  return (
    candidates.find((n) => norm(n.label) === p) ??
    candidates.filter((n) => p.includes(norm(n.label))).sort((a, b) => b.label.length - a.label.length)[0] ??
    candidates.find((n) => norm(n.label).includes(p))
  )
}

function num(s: string) {
  return Number(s.replace(/,/g, ''))
}

/**
 * Plain-English changes:
 *   "increase Ad Spend 20%", "reduce cost per order by 0.5", "set Voucher Coverage to 15%",
 *   "Ad Spend +20%", "rain index -10".
 */
export function parseChange(text: string, tree: Tree): ParsedChange {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return { ok: false, error: 'Describe a change, e.g. "increase Ad Spend 20%".' }
  let phrase = ''
  let kind: Assumption['kind'] = 'pct'
  let value = 0
  let isPercent = false
  let points = false

  let m = /^set (.+?) (?:to|=|at) ([-+]?[\d.,]+)\s*(%|pp|points?)?$/i.exec(t)
  if (m) {
    phrase = m[1]
    kind = 'set'
    value = num(m[2])
    isPercent = !!m[3]
  } else if ((m = /^(\w+) (.+?) (?:by )?([\d.,]+)\s*(%|pp|points?|percentage points?)?$/i.exec(t)) && (UP.test(m[1]) || DOWN.test(m[1]))) {
    phrase = m[2]
    const sign = UP.test(m[1]) ? 1 : -1
    value = sign * num(m[3])
    points = !!m[4] && m[4] !== '%'
    isPercent = m[4] === '%'
    kind = isPercent ? 'pct' : 'add'
  } else if ((m = /^(.+?) ([+-]) ?([\d.,]+)\s*(%|pp|points?)?$/i.exec(t))) {
    phrase = m[1]
    value = (m[2] === '-' ? -1 : 1) * num(m[3])
    isPercent = m[4] === '%'
    points = !!m[4] && m[4] !== '%'
    kind = isPercent ? 'pct' : 'add'
  } else return { ok: false, error: 'Try "increase Ad Spend 20%", "set Voucher Coverage to 15%" or "Ad Spend +500".' }

  if (!Number.isFinite(value)) return { ok: false, error: 'That number could not be read.' }
  const node = matchNode(tree, phrase.replace(/^(the|our) /i, ''))
  if (!node) return { ok: false, error: `No input card matches "${phrase}".` }
  const percentCard = node.format === 'percent'
  // "15%" on a percent card means 0.15; "2 points" on a percent card means +0.02.
  if (percentCard && ((kind === 'set' && isPercent) || points)) value /= 100
  return { ok: true, assumption: { nodeId: node.id, kind, value }, label: node.label }
}
