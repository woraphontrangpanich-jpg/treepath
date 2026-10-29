import { pad2 } from '../data/detect'
import { aggregateSeries, dateColumnOf, type SeriesFilter } from '../data/series'
import type { Grain, Link, SeriesPoint, Table } from '../data/types'
import { evaluate } from './formula'
import { findByLabel, topoOrder, tryParse } from './graph'
import type { MetricBinding, NodeFormat, Tree, TreeNode } from './types'

export function resolveTable(tables: Table[], b: Pick<MetricBinding, 'tableId' | 'fileName' | 'sheetName'>) {
  return tables.find((t) => t.id === b.tableId) ?? tables.find((t) => t.fileName === b.fileName && t.sheetName === b.sheetName)
}

/** Turn binding filters into same-table filters, following table links for filters on another table. */
export function resolveFilters(tables: Table[], links: Link[], table: Table, b: MetricBinding): SeriesFilter[] | string {
  const out: SeriesFilter[] = []
  for (const f of b.filters ?? []) {
    if (f.values.length === 0) continue
    if (f.tableId === table.id) {
      out.push({ column: f.column, values: f.values })
      continue
    }
    const other = tables.find((t) => t.id === f.tableId)
    if (!other) return `Filter table is missing`
    const link = links.find(
      (l) => (l.from.tableId === table.id && l.to.tableId === other.id) || (l.to.tableId === table.id && l.from.tableId === other.id),
    )
    if (!link) return `No link between ${table.name} and ${other.name} for the "${f.column}" filter`
    const [here, there] = link.from.tableId === table.id ? [link.from.column, link.to.column] : [link.to.column, link.from.column]
    const fi = other.columns.findIndex((c) => c.name === f.column)
    const ki = other.columns.findIndex((c) => c.name === there)
    const want = new Set(f.values)
    const keys = new Set<string | number | boolean>()
    for (const row of other.rows) {
      const k = row[ki]
      if (k !== null && want.has(row[fi] as never)) keys.add(k)
    }
    out.push({ column: here, values: [...keys] })
  }
  return out
}

function bucketEnd(start: string, grain: Grain) {
  if (grain === 'day') return start
  const d = new Date(`${start}T00:00:00Z`)
  if (grain === 'week') d.setUTCDate(d.getUTCDate() + 6)
  else d.setUTCMonth(d.getUTCMonth() + 1, 0)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export interface NodeSeries {
  /** The node's value over time: formula result for formula nodes, actuals otherwise. */
  points: SeriesPoint[]
  /** Reported actuals when a formula node is also bound to data (for the reconciliation gap). */
  actual?: SeriesPoint[]
  format: NodeFormat
  error?: string
}

export interface TreeSeries {
  byNode: Map<string, NodeSeries>
  /** Last complete date across bound tables; partial final weeks/months are dropped. */
  lastDate: string | null
}

export function computeTreeSeries(tree: Tree, tables: Table[], links: Link[]): TreeSeries {
  const byNode = new Map<string, NodeSeries>()
  let lastDate: string | null = null
  for (const n of tree.nodes) {
    if (!n.metric) continue
    const t = resolveTable(tables, n.metric)
    const dc = t && dateColumnOf(t)
    const max = dc && t.columns.find((c) => c.name === dc)?.profile.max
    if (typeof max === 'string' && (lastDate === null || max > lastDate)) lastDate = max
  }

  const actualOf = (n: TreeNode): NodeSeries | null => {
    if (!n.metric) return null
    const format: NodeFormat = n.format ?? 'number'
    const t = resolveTable(tables, n.metric)
    if (!t) return { points: [], format, error: `Table "${n.metric.sheetName}" from ${n.metric.fileName} is not imported` }
    const col = t.columns.find((c) => c.name === n.metric!.column)
    if (!col) return { points: [], format, error: `Column "${n.metric.column}" not found in ${t.name}` }
    if (!dateColumnOf(t)) return { points: [], format, error: `${t.name} has no date column` }
    const filters = resolveFilters(tables, links, t, n.metric)
    if (typeof filters === 'string') return { points: [], format, error: filters }
    let points = aggregateSeries(t, col.name, { grain: tree.grain, aggregation: n.metric.aggregation, filters })
    if (lastDate) points = points.filter((p) => bucketEnd(p.date, tree.grain) <= lastDate!)
    return { points, format: n.format ?? col.format ?? 'number' }
  }

  const { order, cyclic } = topoOrder(tree.nodes, tree.edges)
  const nodeById = new Map(tree.nodes.map((n) => [n.id, n]))
  for (const id of [...order, ...cyclic]) {
    const n = nodeById.get(id)!
    const actual = actualOf(n)
    if (n.formula === undefined) {
      if (actual) byNode.set(id, actual)
      continue
    }
    const format: NodeFormat = n.format ?? actual?.format ?? 'number'
    if (cyclic.includes(id)) {
      byNode.set(id, { points: [], actual: actual?.points, format, error: 'Part of a calculation loop' })
      continue
    }
    const parsed = tryParse(n.formula)
    if (!parsed.ok) {
      byNode.set(id, { points: [], actual: actual?.points, format, error: parsed.error })
      continue
    }
    const inputs = new Map<string, Map<string, number>>()
    let error: string | undefined
    for (const ref of parsed.refs) {
      const src = findByLabel(tree.nodes, ref)
      const s = src && byNode.get(src.id)
      if (!s || s.points.length === 0) {
        error = `"${ref}" has no data`
        break
      }
      inputs.set(ref, new Map(s.points.map((p) => [p.date, p.value])))
    }
    if (error) {
      byNode.set(id, { points: [], actual: actual?.points, format, error })
      continue
    }
    // Evaluate on dates where every input has a value (constant-only formulas use the actual's dates).
    let dates: string[]
    if (inputs.size === 0) dates = actual?.points.map((p) => p.date) ?? []
    else {
      const [first, ...rest] = [...inputs.values()]
      dates = [...first.keys()].filter((d) => rest.every((m) => m.has(d))).sort()
    }
    const points: SeriesPoint[] = []
    for (const date of dates) {
      const v = evaluate(parsed.ast, (name) => {
        for (const [k, m] of inputs) if (k.toLowerCase() === name.trim().toLowerCase()) return m.get(date)!
        return NaN
      })
      if (Number.isFinite(v)) points.push({ date, value: v, n: 1 })
    }
    byNode.set(id, { points, actual: actual?.points, format })
  }
  return { byNode, lastDate }
}

export interface NodeSummary {
  latest: SeriesPoint | null
  previous: SeriesPoint | null
  change: number | null
  /** Mean of the last up-to-28 periods (stable headline for noisy daily data). */
  recentMean: number | null
  /** Formula result minus reported actual on the latest date, when both exist. */
  gap: number | null
}

export function summarize(s: NodeSeries | undefined): NodeSummary {
  const pts = s?.points ?? []
  const latest = pts.at(-1) ?? null
  const previous = pts.at(-2) ?? null
  const recent = pts.slice(-28)
  const actualLatest = latest && s?.actual?.find((p) => p.date === latest.date)
  return {
    latest,
    previous,
    change: latest && previous && previous.value !== 0 ? (latest.value - previous.value) / Math.abs(previous.value) : null,
    recentMean: recent.length ? recent.reduce((a, p) => a + p.value, 0) / recent.length : null,
    gap: latest && actualLatest ? latest.value - actualLatest.value : null,
  }
}
