import type { Cell, ColumnRef, Link, Table } from './types'

export type Cardinality = 'one-to-one' | 'many-to-one' | 'one-to-many' | 'many-to-many'

export interface LinkStats {
  /** Share of distinct `from` values that exist in `to` (0..1). */
  matchRate: number
  fromDistinct: number
  toDistinct: number
  matched: number
  unmatchedSamples: Cell[]
  cardinality: Cardinality
}

function norm(c: Cell): string | null {
  if (c === null) return null
  return typeof c === 'string' ? c.trim().toLowerCase() : String(c)
}

function columnValues(table: Table, column: string) {
  const idx = table.columns.findIndex((c) => c.name === column)
  if (idx < 0) return null
  const values = new Map<string, Cell>()
  let nonNull = 0
  for (const row of table.rows) {
    const k = norm(row[idx])
    if (k === null) continue
    nonNull++
    if (!values.has(k)) values.set(k, row[idx])
  }
  return { values, unique: values.size === nonNull }
}

export function findTable(tables: Table[], ref: ColumnRef) {
  return tables.find((t) => t.id === ref.tableId)
}

export function linkStats(tables: Table[], link: Pick<Link, 'from' | 'to'>): LinkStats | null {
  const a = findTable(tables, link.from)
  const b = findTable(tables, link.to)
  if (!a || !b) return null
  const va = columnValues(a, link.from.column)
  const vb = columnValues(b, link.to.column)
  if (!va || !vb) return null
  let matched = 0
  const unmatchedSamples: Cell[] = []
  for (const [k, raw] of va.values) {
    if (vb.values.has(k)) matched++
    else if (unmatchedSamples.length < 5) unmatchedSamples.push(raw)
  }
  const cardinality: Cardinality =
    va.unique && vb.unique ? 'one-to-one' : vb.unique ? 'many-to-one' : va.unique ? 'one-to-many' : 'many-to-many'
  return {
    matchRate: va.values.size === 0 ? 0 : matched / va.values.size,
    fromDistinct: va.values.size,
    toDistinct: vb.values.size,
    matched,
    unmatchedSamples,
    cardinality,
  }
}

function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(code|id|key)$/, '')
}

export interface LinkSuggestion {
  from: ColumnRef
  to: ColumnRef
  reason: 'same name' | 'matching values'
  stats: LinkStats
}

const sameRef = (a: ColumnRef, b: ColumnRef) => a.tableId === b.tableId && a.column === b.column
const sameLink = (l: Pick<Link, 'from' | 'to'>, from: ColumnRef, to: ColumnRef) =>
  (sameRef(l.from, from) && sameRef(l.to, to)) || (sameRef(l.from, to) && sameRef(l.to, from))

/**
 * Suggest key links between tables: key/dimension columns with similar names or overlapping
 * values. Date columns are excluded — every table is already aligned on its date axis.
 */
export function suggestLinks(tables: Table[], existing: Link[]): LinkSuggestion[] {
  const out: LinkSuggestion[] = []
  const candidates = tables.flatMap((t) =>
    t.columns
      .filter((c) => (c.role === 'key' || c.role === 'dimension') && c.profile.distinct > 1 && c.profile.distinct <= 50_000)
      .map((c) => ({ table: t, column: c })),
  )
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]
      if (a.table.id === b.table.id) continue
      // Point from the "many" side to the side with fewer distinct values (the lookup).
      const [from, to] = a.column.profile.distinct >= b.column.profile.distinct ? [a, b] : [b, a]
      const fromRef = { tableId: from.table.id, column: from.column.name }
      const toRef = { tableId: to.table.id, column: to.column.name }
      if (existing.some((l) => sameLink(l, fromRef, toRef))) continue
      const stats = linkStats(tables, { from: fromRef, to: toRef })
      // Only suggest links to a lookup (unique values on the target side); fact-to-fact pairs are noise.
      if (!stats || stats.cardinality === 'many-to-many' || stats.cardinality === 'one-to-many') continue
      const nameMatch = normName(a.column.name) === normName(b.column.name)
      if (nameMatch && stats.matchRate >= 0.5) out.push({ from: fromRef, to: toRef, reason: 'same name', stats })
      else if (!nameMatch && stats.matchRate >= 0.8 && stats.matched >= 2) out.push({ from: fromRef, to: toRef, reason: 'matching values', stats })
    }
  }
  return out.sort((x, y) => y.stats.matchRate - x.stats.matchRate)
}

/**
 * Order a link drawn by hand so `to` is the lookup side (unique values), whichever end the user started from.
 * Ties keep the drawn order.
 */
export function orientLink(tables: Table[], a: ColumnRef, b: ColumnRef): Pick<Link, 'from' | 'to'> {
  const s = linkStats(tables, { from: a, to: b })
  return s?.cardinality === 'one-to-many' ? { from: b, to: a } : { from: a, to: b }
}

export function hasLink(links: Pick<Link, 'from' | 'to'>[], a: ColumnRef, b: ColumnRef) {
  return links.some((l) => sameLink(l, a, b))
}
