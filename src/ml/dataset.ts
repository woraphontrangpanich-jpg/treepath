import { normKey } from '../data/keys'
import { linkStats } from '../data/links'
import type { Cell, Column, Link, Table } from '../data/types'
import { rng } from '../model/stats'

/**
 * Turning a file into model-ready numbers. Columns can come from the file itself or from a lookup
 * file it is connected to (e.g. a region's store count), matched row by row through the link.
 */

export interface Source {
  id: string
  label: string
  column: Column
  /** Which file it comes from, when it isn't the main one. */
  via?: string
  values: Cell[]
}

export type Task = 'classification' | 'regression'
export type FeatureKind = 'number' | 'category' | 'date'

export function kindOf(c: Column): FeatureKind {
  if (c.type === 'date' || c.role === 'date') return 'date'
  if (c.type === 'number' && c.role !== 'key') return 'number'
  return 'category'
}

/** Every column usable for this file: its own, plus the columns of lookup files it links to. */
export function sourcesFor(table: Table, tables: Table[], links: Link[]): Source[] {
  const own: Source[] = table.columns
    .filter((c) => c.role !== 'ignore' && c.type !== 'empty')
    .map((c) => {
      const ci = table.columns.indexOf(c)
      return { id: c.name, label: c.name, column: c, values: table.rows.map((r) => r[ci]) }
    })
  const extra: Source[] = []
  for (const l of links) {
    const [mine, other] = l.from.tableId === table.id ? [l.from, l.to] : l.to.tableId === table.id ? [l.to, l.from] : [null, null]
    if (!mine || !other) continue
    const lookup = tables.find((t) => t.id === other.tableId)
    if (!lookup) continue
    const st = linkStats(tables, { from: mine, to: other })
    if (!st || (st.cardinality !== 'many-to-one' && st.cardinality !== 'one-to-one')) continue
    const ki = lookup.columns.findIndex((c) => c.name === other.column)
    const mi = table.columns.findIndex((c) => c.name === mine.column)
    const byKey = new Map<string, Cell[]>()
    for (const r of lookup.rows) {
      const k = normKey(r[ki])
      if (k !== null && !byKey.has(k)) byKey.set(k, r)
    }
    lookup.columns.forEach((c, ci) => {
      if (ci === ki || c.role === 'ignore' || c.type === 'empty' || c.role === 'date') return
      const id = `${lookup.id}:${c.name}`
      if (extra.some((e) => e.id === id)) return
      extra.push({
        id,
        label: `${lookup.name} › ${c.name}`,
        via: lookup.name,
        column: c,
        values: table.rows.map((r) => byKey.get(normKey(r[mi]) ?? '')?.[ci] ?? null),
      })
    })
  }
  return [...own, ...extra]
}

/** Suggest the task from what the target looks like. */
export function suggestTask(s: Source): Task {
  const c = s.column
  if (c.type !== 'number' || c.role === 'key') return 'classification'
  return c.profile.distinct <= 10 ? 'classification' : 'regression'
}

/** How each raw column becomes numbers; saved with the model so new rows are encoded the same way. */
export type FeatureEncoding =
  | { id: string; label: string; kind: 'number'; fill: number; mean: number; std: number }
  | { id: string; label: string; kind: 'category'; levels: string[] }
  | { id: string; label: string; kind: 'date'; start: number }

export interface Encoder {
  features: FeatureEncoding[]
  /** One name per encoded column, and which feature it belongs to. */
  names: string[]
  owner: number[]
}

const MAX_LEVELS = 15
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dateParts(v: Cell): { days: number; month: number; dow: number } | null {
  if (typeof v !== 'string') return null
  const t = Date.parse(`${v.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  return { days: t / 86_400_000, month: d.getUTCMonth() + 1, dow: (d.getUTCDay() + 6) % 7 }
}

export function fitEncoder(sources: Source[], rows: number[]): Encoder {
  const features: FeatureEncoding[] = []
  const names: string[] = []
  const owner: number[] = []
  sources.forEach((s) => {
    const fi = features.length
    const k = kindOf(s.column)
    if (k === 'number') {
      const v = rows.map((r) => s.values[r]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
      const sorted = [...v].sort((a, b) => a - b)
      const fill = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
      const mean = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
      const std = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, v.length - 1)) || 1
      features.push({ id: s.id, label: s.label, kind: 'number', fill, mean, std })
      names.push(s.label)
      owner.push(fi)
    } else if (k === 'category') {
      const counts = new Map<string, number>()
      for (const r of rows) {
        const v = s.values[r]
        if (v !== null) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1)
      }
      // One column per common value; rare values all read as zeros.
      const levels = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_LEVELS).map(([v]) => v)
      features.push({ id: s.id, label: s.label, kind: 'category', levels })
      for (const l of levels) {
        names.push(`${s.label} = ${l}`)
        owner.push(fi)
      }
    } else {
      const days = rows.map((r) => dateParts(s.values[r])?.days).filter((x): x is number => x !== undefined)
      features.push({ id: s.id, label: s.label, kind: 'date', start: days.length ? Math.min(...days) : 0 })
      names.push(`${s.label}: days since start`, `${s.label}: month`)
      owner.push(fi, fi)
      for (const d of DOW) {
        names.push(`${s.label}: ${d}`)
        owner.push(fi)
      }
    }
  })
  return { features, names, owner }
}

/** Encode one row of raw values (keyed by feature id). `standardize` scales numbers for linear models. */
export function encodeRow(enc: Encoder, get: (id: string) => Cell, standardize: boolean): number[] {
  const out: number[] = []
  for (const f of enc.features) {
    const v = get(f.id)
    if (f.kind === 'number') {
      const x = typeof v === 'number' && Number.isFinite(v) ? v : f.fill
      out.push(standardize ? (x - f.mean) / f.std : x)
    } else if (f.kind === 'category') {
      const s = v === null ? null : String(v)
      for (const l of f.levels) out.push(s === l ? 1 : 0)
    } else {
      const p = dateParts(v)
      const days = p ? p.days - f.start : 0
      const month = p ? p.month : 6
      out.push(standardize ? days / 365 : days, standardize ? (month - 6.5) / 3.5 : month)
      for (let d = 0; d < 7; d++) out.push(p && p.dow === d ? 1 : 0)
    }
  }
  return out
}

export interface Prepared {
  task: Task
  classes: string[]
  /** Row indexes into the file, after dropping rows without a target. */
  train: number[]
  test: number[]
  y: number[]
  dropped: number
}

export interface SplitOptions {
  testShare: number
  /** 'latest' tests on the most recent rows (needs a date column), like using a model on the future. */
  how: 'random' | 'latest'
  seed: number
}

export function prepare(target: Source, task: Task, n: number, dates: Cell[] | null, split: SplitOptions): Prepared | string {
  const keep: number[] = []
  for (let i = 0; i < n; i++) {
    const v = target.values[i]
    if (v === null || (task === 'regression' && (typeof v !== 'number' || !Number.isFinite(v)))) continue
    keep.push(i)
  }
  if (keep.length < 20) return 'Need at least 20 rows that have a value in the column you want to predict.'
  let classes: string[] = []
  const y: number[] = new Array(n).fill(NaN)
  if (task === 'classification') {
    const counts = new Map<string, number>()
    for (const i of keep) counts.set(String(target.values[i]), (counts.get(String(target.values[i])) ?? 0) + 1)
    if (counts.size < 2) return 'The column you want to predict has only one value, so there is nothing to learn.'
    if (counts.size > 20) return `“${target.label}” has ${counts.size} different values. Pick a column with 20 or fewer categories, or predict it as a number.`
    classes = [...counts.keys()].sort()
    for (const i of keep) y[i] = classes.indexOf(String(target.values[i]))
  } else for (const i of keep) y[i] = target.values[i] as number

  let order = keep
  if (split.how === 'latest' && dates) order = [...keep].sort((a, b) => String(dates[a] ?? '').localeCompare(String(dates[b] ?? '')))
  else {
    const rand = rng(split.seed)
    order = [...keep]
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
  }
  const cut = Math.round(order.length * (1 - split.testShare))
  return { task, classes, train: order.slice(0, cut), test: order.slice(cut), y, dropped: n - keep.length }
}
