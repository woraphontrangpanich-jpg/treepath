import { clsx } from 'clsx'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { keyCoverage, resolveKeys } from '../../data/keys'
import type { ColumnRef, Link, Table } from '../../data/types'
import { SectionTitle, Select } from '../primitives'

/** Columns that can act as the match key: any column taking part in a link. */
export function keyCandidates(tables: Table[], links: Link[]): ColumnRef[] {
  const seen = new Map<string, ColumnRef>()
  for (const l of links)
    for (const r of [l.to, l.from])
      if (tables.some((t) => t.id === r.tableId && t.columns.some((c) => c.name === r.column))) seen.set(`${r.tableId}|${r.column}`, r)
  // Lookup tables first: their values are the cleanest canonical keys.
  return [...seen.values()].sort((a, b) => {
    const ua = tables.find((t) => t.id === a.tableId)!.columns.find((c) => c.name === a.column)?.profile
    const ub = tables.find((t) => t.id === b.tableId)!.columns.find((c) => c.name === b.column)?.profile
    return Number(ub?.distinct === ub?.count) - Number(ua?.distinct === ua?.count)
  })
}

export function refLabel(tables: Table[], r: ColumnRef) {
  return `${tables.find((t) => t.id === r.tableId)?.name ?? '?'} › ${r.column}`
}

/**
 * Before trusting a join, see it: for one key, how many rows each file has per key value,
 * and which values didn't match anything.
 */
export function KeyCheck({ tables, links }: { tables: Table[]; links: Link[] }) {
  const candidates = useMemo(() => keyCandidates(tables, links), [tables, links])
  const [pick, setPick] = useState(0)
  const ref = candidates[Math.min(pick, candidates.length - 1)]
  const res = useMemo(() => (ref ? resolveKeys(tables, links, ref) : null), [tables, links, ref])
  const cov = useMemo(() => (res ? keyCoverage(tables, res) : []), [tables, res])
  if (!ref || !res) return null
  const allGood = cov.every((c) => c.matchedRows === c.rows)

  return (
    <section>
      <SectionTitle aside={<span className="text-xs text-faint">Rows in each file for every key value</span>}>Matching rows</SectionTitle>
      <div className="rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Key</span>
            <Select value={pick} onChange={(e) => setPick(Number(e.target.value))} aria-label="Key to check">
              {candidates.map((c, i) => (
                <option key={`${c.tableId}|${c.column}`} value={i}>
                  {refLabel(tables, c)}
                </option>
              ))}
            </Select>
          </label>
          <span className={clsx('ml-auto flex items-center gap-1.5 text-sm', allGood ? 'text-up' : 'text-warn')}>
            {allGood ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
            {allGood ? `Every row in ${cov.length} files matches one of ${res.keys.length} keys` : 'Some rows don’t match a key'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">File and key column</th>
                {res.keys.slice(0, 12).map((k) => (
                  <th key={k} className="px-3 py-2 text-right font-semibold text-ink">
                    {k}
                  </th>
                ))}
                {res.keys.length > 12 && <th className="px-3 py-2 text-right font-medium">+{res.keys.length - 12}</th>}
                <th className="px-4 py-2 text-right font-medium">Matched</th>
              </tr>
            </thead>
            <tbody>
              {cov.map((c) => (
                <tr key={c.tableId} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">
                    <div className="font-medium">{c.tableName}</div>
                    <div className="text-xs text-faint">by “{c.column}”</div>
                  </td>
                  {res.keys.slice(0, 12).map((k) => (
                    <td key={k} className={clsx('px-3 py-2 text-right', !c.perKey.get(k) && 'text-down')}>
                      {(c.perKey.get(k) ?? 0).toLocaleString()}
                    </td>
                  ))}
                  {res.keys.length > 12 && <td />}
                  <td className={clsx('px-4 py-2 text-right', c.matchedRows < c.rows ? 'text-warn' : 'text-up')}>
                    {Math.round((c.matchedRows / Math.max(1, c.rows)) * 100)}%
                    {c.unmatched.length > 0 && (
                      <div className="text-xs text-muted">
                        no match: {c.unmatched.map((u) => `“${String(u)}”`).join(', ')}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
          Numbers are rows per key. A red 0 means that file has nothing for that key; unmatched rows are left out of per-key models.
        </p>
      </div>
    </section>
  )
}
