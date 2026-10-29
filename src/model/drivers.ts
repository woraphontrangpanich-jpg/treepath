import type { SeriesPoint } from '../data/types'
import type { TreeSeries } from '../tree/compute'
import type { NodeFormat, Tree, TreeEdge } from '../tree/types'

/** change: period-over-period change on a log/logit scale (elasticity-style, robust to trends). level: raw values. */
export type ModelType = 'change' | 'level'
import { ols, predict, vif } from './regression'
import { correlation, mean } from './stats'

/** Scale a series is modelled on: log for positive amounts, logit for rates in (0,1), raw otherwise. */
export type Transform = 'log' | 'logit' | 'raw'

export function chooseTransform(points: SeriesPoint[], format: NodeFormat | undefined): Transform {
  if (points.length === 0) return 'raw'
  if (format === 'percent' && points.every((p) => p.value > 0 && p.value < 1)) return 'logit'
  if (points.every((p) => p.value > 0)) return 'log'
  return 'raw'
}

export function fwd(t: Transform, v: number) {
  if (t === 'log') return Math.log(v)
  if (t === 'logit') return Math.log(v / (1 - v))
  return v
}

export function inv(t: Transform, z: number) {
  if (t === 'log') return Math.exp(z)
  if (t === 'logit') return 1 / (1 + Math.exp(-z))
  return z
}

/** Transform a scenario value safely (values outside the transform's domain fall back to the nearest valid one). */
export function fwdSafe(t: Transform, v: number) {
  if (t === 'log') return Math.log(Math.max(v, 1e-12))
  if (t === 'logit') return fwd(t, Math.min(Math.max(v, 1e-9), 1 - 1e-9))
  return v
}

export const TRANSFORM_LABEL: Record<Transform, string> = { log: 'ln', logit: 'logit', raw: '' }

export interface DriverTerm {
  edgeId: string
  sourceId: string
  label: string
  lag: number
  transform: Transform
  coef: number
  se: number
  t: number
  p: number
  vif: number
  expectedSign?: 'positive' | 'negative'
  signMismatch: boolean
  /** Correlation of the target with this driver at lags 0..maxLag (same model scale). */
  lagScan: { lag: number; r: number }[]
}

export interface WalkForward {
  folds: number
  predictions: number
  /** Out-of-sample R² on the model scale. */
  r2: number
  mae: number
  /** Share of periods where the predicted direction of change was right. */
  directionHit: number
  errors: number[]
}

export interface DriverModel {
  ok: true
  targetId: string
  targetLabel: string
  type: ModelType
  targetTransform: Transform
  intercept: number
  terms: DriverTerm[]
  /** Covariance of the slope coefficients (for scenario ranges). */
  slopeCov: number[][]
  r2: number
  adjR2: number
  fStat: number
  fP: number
  n: number
  /** Number of matched keys when fitted per key (e.g. 3 regions); 0 when fitted on totals. */
  keys: number
  firstDate: string
  lastDate: string
  residSd: number
  walkForward: WalkForward | null
  /** Recent points for an actual-vs-fitted chart (model scale). */
  fitTail: { date: string; actual: number; fitted: number }[]
  warnings: string[]
}

export interface DriverModelError {
  ok: false
  targetId: string
  targetLabel: string
  error: string
}

export type DriverFit = DriverModel | DriverModelError

const MAX_LAG_SCAN = 7

interface Design {
  dates: string[]
  y: number[]
  x: number[][]
}

/** Build the regression rows: target and lagged drivers on a shared date axis. */
function design(type: ModelType, target: SeriesPoint[], tt: Transform, drivers: { points: SeriesPoint[]; tf: Transform; lag: number }[]): Design {
  const maps = drivers.map((d) => new Map(d.points.map((p) => [p.date, p.value])))
  const tmap = new Map(target.map((p) => [p.date, p.value]))
  // Shared axis: every date where the target and all drivers have values.
  const axis = target.map((p) => p.date).filter((d) => maps.every((m) => m.has(d)))
  const maxLag = Math.max(0, ...drivers.map((d) => d.lag))
  const start = maxLag + (type === 'change' ? 1 : 0)
  const out: Design = { dates: [], y: [], x: [] }
  for (let i = start; i < axis.length; i++) {
    const yv = type === 'change' ? fwd(tt, tmap.get(axis[i])!) - fwd(tt, tmap.get(axis[i - 1])!) : tmap.get(axis[i])!
    const row = drivers.map((d, j) => {
      const at = axis[i - d.lag]
      return type === 'change' ? fwd(d.tf, maps[j].get(at)!) - fwd(d.tf, maps[j].get(axis[i - d.lag - 1])!) : maps[j].get(at)!
    })
    if (!Number.isFinite(yv) || row.some((v) => !Number.isFinite(v))) continue
    out.dates.push(axis[i])
    out.y.push(yv)
    out.x.push(row)
  }
  return out
}

/** Stack per-key designs into one, ordered by date so walk-forward validation stays chronological. */
function stack(parts: Design[]): Design {
  const rows = parts.flatMap((d) => d.dates.map((date, i) => ({ date, y: d.y[i], x: d.x[i] })))
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { dates: rows.map((r) => r.date), y: rows.map((r) => r.y), x: rows.map((r) => r.x) }
}

function walkForward(d: Design): WalkForward | null {
  const n = d.y.length
  const k = d.x[0]?.length ?? 0
  const block = Math.max(5, Math.round(n / 20))
  const start = Math.max(k + 10, Math.round(n * 0.3))
  if (n - start < block) return null
  const errors: number[] = []
  const actual: number[] = []
  const preds: number[] = []
  let folds = 0
  for (let s = start; s < n; s += block) {
    const fit = ols(d.x.slice(0, s), d.y.slice(0, s))
    if (!fit) continue
    folds++
    for (let i = s; i < Math.min(n, s + block); i++) {
      const p = predict(fit.coef, d.x[i])
      preds.push(p)
      actual.push(d.y[i])
      errors.push(d.y[i] - p)
    }
  }
  if (preds.length === 0) return null
  const ma = mean(actual)
  const sse = errors.reduce((s, e) => s + e * e, 0)
  const sst = actual.reduce((s, a) => s + (a - ma) ** 2, 0)
  let hits = 0
  let moves = 0
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] === 0) continue
    moves++
    if (Math.sign(actual[i]) === Math.sign(preds[i])) hits++
  }
  return {
    folds,
    predictions: preds.length,
    r2: sst > 0 ? 1 - sse / sst : 0,
    mae: mean(errors.map(Math.abs)),
    directionHit: moves ? hits / moves : 0,
    errors,
  }
}

export function fitTarget(tree: Tree, series: TreeSeries, targetId: string): DriverFit {
  const target = tree.nodes.find((n) => n.id === targetId)!
  const base = { targetId, targetLabel: target.label }
  const edges = tree.edges.filter((e) => e.target === targetId && e.role === 'driver')
  const ts = series.byNode.get(targetId)
  if (!ts || ts.points.length === 0) return { ok: false, ...base, error: ts?.error ?? `${target.label} has no data` }
  const type: ModelType = 'change'
  const warnings: string[] = []

  type Usable = { edge: TreeEdge; label: string; points: SeriesPoint[]; panel?: Map<string, SeriesPoint[]>; format: NodeFormat; tf: Transform; lag: number }
  const usable: Usable[] = []
  for (const e of edges) {
    const src = tree.nodes.find((n) => n.id === e.source)
    const s = series.byNode.get(e.source)
    if (!src || !s || s.points.length === 0) {
      warnings.push(`${src?.label ?? 'A driver'} has no data and was left out.`)
      continue
    }
    usable.push({ edge: e, label: src.label, points: s.points, panel: s.panel, format: s.format, tf: 'raw', lag: e.lag ?? 0 })
  }
  if (usable.length === 0) return { ok: false, ...base, error: 'No driver has data' }

  // With a match key, fit on rows matched by date AND key (e.g. each region), not on totals.
  let keys: string[] = []
  if (series.keys) {
    const missing = [ts, ...usable].some((u) => !u.panel)
    if (missing) {
      const names = [!ts.panel ? target.label : null, ...usable.filter((u) => !u.panel).map((u) => u.label)].filter(Boolean)
      warnings.push(`${names.join(', ')} ${names.length > 1 ? 'aren’t' : 'isn’t'} linked to the match key, so ${target.label} was fitted on totals.`)
    } else keys = [...ts.panel!.keys()].filter((k) => usable.every((u) => u.panel!.has(k)))
  }
  const byKey = keys.length >= 2
  const allPoints = (pts: SeriesPoint[], panel?: Map<string, SeriesPoint[]>) => (byKey && panel ? [...panel.values()].flat() : pts)
  const tt = chooseTransform(allPoints(ts.points, ts.panel), ts.format)
  for (const u of usable) u.tf = chooseTransform(allPoints(u.points, u.panel), u.format)

  const build = (list: Usable[], lagOverride?: number) =>
    byKey
      ? stack(keys.map((k) => design(type, ts.panel!.get(k)!, tt, list.map((u) => ({ points: u.panel!.get(k)!, tf: u.tf, lag: lagOverride ?? u.lag })))))
      : design(type, ts.points, tt, list.map((u) => ({ points: u.points, tf: u.tf, lag: lagOverride ?? u.lag })))

  let d = build(usable)
  // Drop drivers that never move (no information to fit).
  const moving = usable.filter((_, j) => {
    const col = d.x.map((r) => r[j])
    return col.some((v) => Math.abs(v - col[0]) > 1e-12)
  })
  for (const u of usable) if (!moving.includes(u)) warnings.push(`${u.label} never changes in this period, so its effect can't be estimated.`)
  if (moving.length === 0) return { ok: false, ...base, error: 'Drivers never change; nothing to fit' }
  if (moving.length !== usable.length) d = build(moving)

  if (d.y.length < moving.length + 10)
    return { ok: false, ...base, error: `Only ${d.y.length} usable rows of history; need at least ${moving.length + 10}. Try a finer grain.` }

  const fit = ols(d.x, d.y)
  if (!fit) return { ok: false, ...base, error: 'Drivers are perfectly collinear; remove one of them' }
  const vifs = vif(d.x)

  const terms: DriverTerm[] = moving.map((u, j) => {
    const coef = fit.coef[j + 1]
    const signMismatch = !!u.edge.expectedSign && fit.p[j + 1] < 0.2 && (u.edge.expectedSign === 'positive' ? coef < 0 : coef > 0)
    if (signMismatch) warnings.push(`${u.label}: fitted effect is ${coef < 0 ? 'negative' : 'positive'}, but you expected ${u.edge.expectedSign}.`)
    if (vifs[j] > 5) warnings.push(`${u.label} overlaps strongly with other drivers (VIF ${vifs[j].toFixed(1)}); its own effect is uncertain.`)
    const lagScan = Array.from({ length: MAX_LAG_SCAN + 1 }, (_, lag) => {
      const single = build([u], lag)
      return { lag, r: correlation(single.y, single.x.map((r) => r[0])) }
    })
    return {
      edgeId: u.edge.id,
      sourceId: u.edge.source,
      label: u.label,
      lag: u.lag,
      transform: u.tf,
      coef,
      se: fit.se[j + 1],
      t: fit.t[j + 1],
      p: fit.p[j + 1],
      vif: vifs[j],
      expectedSign: u.edge.expectedSign,
      signMismatch,
      lagScan,
    }
  })
  for (const term of terms) if (term.p > 0.1) warnings.push(`${term.label}: effect is not statistically clear (p = ${term.p.toFixed(2)}).`)

  return {
    ok: true,
    ...base,
    type,
    targetTransform: tt,
    intercept: fit.coef[0],
    terms,
    slopeCov: fit.cov.slice(1).map((row) => row.slice(1)),
    r2: fit.r2,
    adjR2: fit.adjR2,
    fStat: fit.fStat,
    fP: fit.fP,
    n: fit.n,
    keys: byKey ? keys.length : 0,
    firstDate: d.dates[0],
    lastDate: d.dates.at(-1)!,
    residSd: fit.residSd,
    walkForward: walkForward(d),
    fitTail: d.dates.slice(-120).map((date, i, arr) => {
      const idx = d.dates.length - arr.length + i
      return { date, actual: d.y[idx], fitted: fit.fitted[idx] }
    }),
    warnings,
  }
}

/** Fit a model for every card that has model-driver inputs. */
export function fitAll(tree: Tree, series: TreeSeries): Map<string, DriverFit> {
  const targets = new Set(tree.edges.filter((e) => e.role === 'driver').map((e) => e.target))
  const out = new Map<string, DriverFit>()
  for (const id of targets) {
    const n = tree.nodes.find((x) => x.id === id)
    if (!n || n.formula !== undefined) continue
    out.set(id, fitTarget(tree, series, id))
  }
  return out
}
