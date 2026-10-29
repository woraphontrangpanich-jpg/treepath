import type { Cell, ColumnRef, Link, Table } from './types'

/**
 * Matching rows across files by a shared key whose column name (and even values) differ per file.
 *
 * Columns are connected by table links (values equal across files, e.g. sales.Region ↔ regions.region_code),
 * and columns of the same table are connected through its rows (regions.region_code ↔ regions.region_name),
 * so "Bangkok" in weather.city can be translated to "BKK" via the regions lookup.
 * Every table in the group gets a map from its raw key value to one canonical key: the value in the
 * column the user picked as the match key.
 */

export function normKey(c: Cell): string | null {
  if (c === null) return null
  return typeof c === 'string' ? c.trim().toLowerCase() : String(c)
}

const refId = (r: ColumnRef) => `${r.tableId}\u0000${r.column}`

export interface KeyResolution {
  /** For each table in the group: its key column and raw→canonical value map. */
  byTable: Map<string, { column: string; map: Map<string, string> }>
  /** Canonical keys (from the chosen column). */
  keys: string[]
}

function colIndex(t: Table, column: string) {
  return t.columns.findIndex((c) => c.name === column)
}

export function resolveKeys(tables: Table[], links: Link[], ref: ColumnRef): KeyResolution | null {
  const tableById = new Map(tables.map((t) => [t.id, t]))
  const root = tableById.get(ref.tableId)
  if (!root || colIndex(root, ref.column) < 0) return null

  // Graph nodes: the chosen column plus every column that takes part in a link.
  // A link can outlive its column (e.g. the file was re-imported with a renamed header); skip those.
  const exists = (r: ColumnRef) => {
    const t = tableById.get(r.tableId)
    return !!t && colIndex(t, r.column) >= 0
  }
  const nodes = new Map<string, ColumnRef>([[refId(ref), ref]])
  for (const l of links) {
    if (exists(l.from)) nodes.set(refId(l.from), l.from)
    if (exists(l.to)) nodes.set(refId(l.to), l.to)
  }
  const adj = new Map<string, { to: ColumnRef; via: 'link' | 'row' }[]>()
  const add = (a: ColumnRef, b: ColumnRef, via: 'link' | 'row') => {
    adj.set(refId(a), [...(adj.get(refId(a)) ?? []), { to: b, via }])
  }
  for (const l of links) {
    if (!nodes.has(refId(l.from)) || !nodes.has(refId(l.to))) continue
    add(l.from, l.to, 'link')
    add(l.to, l.from, 'link')
  }
  const all = [...nodes.values()]
  for (const a of all) for (const b of all) if (a !== b && a.tableId === b.tableId && a.column !== b.column) add(a, b, 'row')

  // Breadth-first: carry the value→canonical map outward from the chosen column.
  const maps = new Map<string, Map<string, string>>()
  const rootMap = new Map<string, string>()
  const ri = colIndex(root, ref.column)
  for (const row of root.rows) {
    const k = normKey(row[ri])
    if (k !== null && !rootMap.has(k)) rootMap.set(k, String(row[ri]).trim())
  }
  maps.set(refId(ref), rootMap)
  const queue: ColumnRef[] = [ref]
  while (queue.length) {
    const cur = queue.shift()!
    const curMap = maps.get(refId(cur))!
    for (const { to, via } of adj.get(refId(cur)) ?? []) {
      if (maps.has(refId(to))) continue
      const t = tableById.get(to.tableId)!
      const next = new Map<string, string>()
      if (via === 'link') {
        // Linked columns share values: keep the keys that actually occur in the target column.
        const ti = colIndex(t, to.column)
        for (const row of t.rows) {
          const k = normKey(row[ti])
          if (k !== null && curMap.has(k)) next.set(k, curMap.get(k)!)
        }
      } else {
        // Same table, other column: translate through each row.
        const fi = colIndex(t, cur.column)
        const ti = colIndex(t, to.column)
        for (const row of t.rows) {
          const kf = normKey(row[fi])
          const kt = normKey(row[ti])
          if (kf !== null && kt !== null && curMap.has(kf) && !next.has(kt)) next.set(kt, curMap.get(kf)!)
        }
      }
      maps.set(refId(to), next)
      queue.push(to)
    }
  }

  const byTable = new Map<string, { column: string; map: Map<string, string> }>()
  for (const [id, map] of maps) {
    const r = nodes.get(id)!
    const existing = byTable.get(r.tableId)
    // One key column per table: prefer the one that resolves the most values.
    if (!existing || map.size > existing.map.size) byTable.set(r.tableId, { column: r.column, map })
  }
  return { byTable, keys: [...new Set(rootMap.values())].sort() }
}

export interface KeyCoverage {
  tableId: string
  tableName: string
  column: string
  rows: number
  matchedRows: number
  /** Rows per canonical key. */
  perKey: Map<string, number>
  unmatched: Cell[]
}

/** How well each linked table's rows map onto the chosen key: what you'd check before trusting a join. */
export function keyCoverage(tables: Table[], res: KeyResolution): KeyCoverage[] {
  const out: KeyCoverage[] = []
  for (const [tableId, { column, map }] of res.byTable) {
    const t = tables.find((x) => x.id === tableId)
    if (!t) continue
    const i = colIndex(t, column)
    const perKey = new Map<string, number>()
    const unmatched: Cell[] = []
    let matched = 0
    for (const row of t.rows) {
      const k = normKey(row[i])
      const canon = k === null ? undefined : map.get(k)
      if (canon !== undefined) {
        matched++
        perKey.set(canon, (perKey.get(canon) ?? 0) + 1)
      } else if (unmatched.length < 5 && !unmatched.includes(row[i])) unmatched.push(row[i])
    }
    out.push({ tableId, tableName: t.name, column, rows: t.rows.length, matchedRows: matched, perKey, unmatched })
  }
  return out
}
