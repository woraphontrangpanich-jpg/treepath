import { aggregateSeries, dateColumnOf } from '../../data/series'
import type { Aggregation, Column, Grain, Table } from '../../data/types'
import { OTHER, SERIES, type Dot, type LineSeries } from './kit'

export const numberColumns = (t: Table) => t.columns.filter((c) => c.role === 'metric')
export const groupColumns = (t: Table) => t.columns.filter((c) => (c.role === 'key' || c.role === 'dimension') && c.profile.distinct >= 2 && c.profile.distinct <= 60)
export const hasDate = (t: Table) => !!dateColumnOf(t)
export const fmtOf = (c?: Column) => (c?.format === 'percent' ? ('percent' as const) : ('number' as const))

function idx(t: Table, name: string) {
  return t.columns.findIndex((c) => c.name === name)
}

/** Group values ranked by their total, so the biggest get the first colours; the rest fold into "Other". */
function rankedGroups(t: Table, metric: string, group: string, keep: number) {
  const gi = idx(t, group)
  const mi = idx(t, metric)
  const totals = new Map<string, number>()
  for (const r of t.rows) {
    if (r[gi] === null) continue
    const v = r[mi]
    totals.set(String(r[gi]), (totals.get(String(r[gi])) ?? 0) + (typeof v === 'number' ? Math.abs(v) : 0))
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  return { top: sorted.slice(0, keep), rest: sorted.slice(keep) }
}

/** A week or month at either end with far fewer rows than usual is only partly in the data; leave it out. */
export function dropPartial<P extends { n: number }>(points: P[], grain: Grain): P[] {
  if (grain === 'day' || points.length < 4) return points
  const ns = points.map((p) => p.n).sort((a, b) => a - b)
  const typical = ns[Math.floor(ns.length / 2)]
  let s = 0
  let e = points.length
  if (points[0].n < typical * 0.9) s++
  if (points[e - 1].n < typical * 0.9) e--
  return points.slice(s, e)
}

export function trendSeries(t: Table, metric: string, aggregation: Aggregation, grain: Grain, group?: string): LineSeries[] {
  const series = trendSeriesRaw(t, metric, aggregation, grain, group)
  // Trim using the total so every line covers the same periods.
  const total = dropPartial(aggregateSeries(t, metric, { grain, aggregation: 'count' }), grain)
  if (!total.length) return series
  const [from, to] = [total[0].date, total.at(-1)!.date]
  return series.map((s) => ({ ...s, points: s.points.filter((p) => p.date >= from && p.date <= to) }))
}

function trendSeriesRaw(t: Table, metric: string, aggregation: Aggregation, grain: Grain, group?: string): LineSeries[] {
  if (!group) return [{ name: metric, color: SERIES[0], points: aggregateSeries(t, metric, { grain, aggregation }) }]
  const { top, rest } = rankedGroups(t, metric, group, rest6(t, group))
  const raw = (vals: string[]) => {
    // Filters compare raw cells, so match numbers as numbers.
    const col = t.columns[idx(t, group)]
    return vals.map((v) => (col.type === 'number' ? Number(v) : v))
  }
  const out: LineSeries[] = top.map((g, i) => ({
    name: g,
    color: SERIES[i],
    points: aggregateSeries(t, metric, { grain, aggregation, filters: [{ column: group, values: raw([g]) }] }),
  }))
  if (rest.length) out.push({ name: 'Other', color: OTHER, points: aggregateSeries(t, metric, { grain, aggregation, filters: [{ column: group, values: raw(rest) }] }) })
  return out
}
/** Six colours in total: five named groups plus "Other" when there are more than six. */
function rest6(t: Table, group: string) {
  return (t.columns.find((c) => c.name === group)?.profile.distinct ?? 0) > 6 ? 5 : 6
}

export function groupBars(t: Table, metric: string, aggregation: 'sum' | 'avg' | 'count', group: string) {
  const gi = idx(t, group)
  const mi = idx(t, metric)
  const acc = new Map<string, { sum: number; n: number }>()
  for (const r of t.rows) {
    if (r[gi] === null) continue
    const v = r[mi]
    const isNum = typeof v === 'number' && Number.isFinite(v)
    if (!isNum && aggregation !== 'count') continue
    const k = String(r[gi])
    const a = acc.get(k) ?? { sum: 0, n: 0 }
    a.sum += isNum ? (v as number) : 0
    a.n++
    acc.set(k, a)
  }
  return [...acc.entries()]
    .map(([label, a]) => ({ label, n: a.n, value: aggregation === 'sum' ? a.sum : aggregation === 'avg' ? a.sum / a.n : a.n }))
    .sort((a, b) => b.value - a.value)
}

/** Rows with both numbers; thinned to at most `max` evenly spaced rows so the chart stays readable. */
export function scatterDots(t: Table, xName: string, yName: string, group?: string, max = 1500): { dots: Dot[]; groups: { name: string; color: string }[]; total: number } {
  const xi = idx(t, xName)
  const yi = idx(t, yName)
  const gi = group ? idx(t, group) : -1
  const all: Dot[] = []
  for (const r of t.rows) {
    const x = r[xi]
    const y = r[yi]
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue
    all.push({ x, y, group: gi >= 0 && r[gi] !== null ? String(r[gi]) : undefined })
  }
  // Scatter colours stay distinguishable for three groups at most; the rest fold into "Other".
  let groups: { name: string; color: string }[] = [{ name: yName, color: SERIES[0] }]
  if (group) {
    const counts = new Map<string, number>()
    for (const d of all) if (d.group) counts.set(d.group, (counts.get(d.group) ?? 0) + 1)
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    const keep = sorted.length > 3 ? sorted.slice(0, 2) : sorted
    groups = keep.map((g, i) => ({ name: g, color: SERIES[i] }))
    if (sorted.length > keep.length) {
      groups.push({ name: 'Other', color: OTHER })
      for (const d of all) if (d.group && !keep.includes(d.group)) d.group = 'Other'
    }
  }
  const step = Math.max(1, Math.ceil(all.length / max))
  return { dots: all.filter((_, i) => i % step === 0), groups, total: all.length }
}

export function columnValues(t: Table, name: string) {
  const i = idx(t, name)
  const out: number[] = []
  for (const r of t.rows) if (typeof r[i] === 'number' && Number.isFinite(r[i])) out.push(r[i] as number)
  return out
}

export function nextDates(last: string, grain: Grain, n: number) {
  const out: string[] = []
  const d = new Date(`${last}T00:00:00Z`)
  for (let i = 0; i < n; i++) {
    if (grain === 'day') d.setUTCDate(d.getUTCDate() + 1)
    else if (grain === 'week') d.setUTCDate(d.getUTCDate() + 7)
    else d.setUTCMonth(d.getUTCMonth() + 1)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}
