import { pad2 } from './detect'
import type { Aggregation, Grain, SeriesPoint, Table } from './types'

/** Map an ISO date to the start of its bucket: the day itself, its ISO week's Monday, or the 1st of the month. */
export function bucketOf(iso: string, grain: Grain): string {
  if (grain === 'day') return iso
  if (grain === 'month') return `${iso.slice(0, 7)}-01`
  const d = new Date(`${iso}T00:00:00Z`)
  const shift = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - shift)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export interface SeriesFilter {
  column: string
  values: (string | number | boolean)[]
}

export interface SeriesOptions {
  grain: Grain
  aggregation: Aggregation
  /** Date column to group by; defaults to the table's first `date`-role column. */
  dateColumn?: string
  filters?: SeriesFilter[]
}

export function dateColumnOf(table: Table): string | undefined {
  return table.columns.find((c) => c.role === 'date')?.name
}

/** Aggregate a metric column into a time series at the requested grain. */
export function aggregateSeries(table: Table, metric: string, opts: SeriesOptions): SeriesPoint[] {
  const dateName = opts.dateColumn ?? dateColumnOf(table)
  const di = table.columns.findIndex((c) => c.name === dateName)
  const mi = table.columns.findIndex((c) => c.name === metric)
  if (di < 0 || mi < 0) return []
  const filters = (opts.filters ?? []).map((f) => ({
    idx: table.columns.findIndex((c) => c.name === f.column),
    set: new Set(f.values),
  }))

  const buckets = new Map<string, { sum: number; n: number; min: number; max: number; last: number; lastDate: string }>()
  for (const row of table.rows) {
    const date = row[di]
    const v = row[mi]
    if (typeof date !== 'string') continue
    if (filters.some((f) => f.idx >= 0 && !f.set.has(row[f.idx] as never))) continue
    const isNum = typeof v === 'number' && Number.isFinite(v)
    if (!isNum && opts.aggregation !== 'count') continue
    const num = isNum ? (v as number) : 0
    const key = bucketOf(date, opts.grain)
    const b = buckets.get(key)
    if (!b) buckets.set(key, { sum: num, n: 1, min: num, max: num, last: num, lastDate: date })
    else {
      b.sum += num
      b.n++
      if (num < b.min) b.min = num
      if (num > b.max) b.max = num
      if (date >= b.lastDate) {
        // Several rows can share the latest date (e.g. one per region); sum them as that day's level.
        b.last = date === b.lastDate ? b.last + num : num
        b.lastDate = date
      }
    }
  }

  const out: SeriesPoint[] = []
  for (const [date, b] of buckets) {
    let value: number
    switch (opts.aggregation) {
      case 'sum': value = b.sum; break
      case 'avg': value = b.sum / b.n; break
      case 'min': value = b.min; break
      case 'max': value = b.max; break
      case 'last': value = b.last; break
      case 'count': value = b.n; break
    }
    out.push({ date, value, n: b.n })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

export interface TableHealth {
  level: 'ok' | 'warn' | 'error'
  message: string
}

/** Checks that matter before a table's metrics can be used in a tree. */
export function tableHealth(table: Table): TableHealth[] {
  const out: TableHealth[] = []
  const dates = table.columns.filter((c) => c.role === 'date')
  const metrics = table.columns.filter((c) => c.role === 'metric')
  const keys = table.columns.filter((c) => c.role === 'key' || c.role === 'dimension')
  if (dates.length === 0 && metrics.length > 0)
    out.push({ level: 'warn', message: 'No date column — metrics from this table cannot form a time series. Use it as a lookup table, or mark a column as Date.' })
  if (dates.length > 1) out.push({ level: 'warn', message: `${dates.length} date columns; "${dates[0].name}" is used as the time axis.` })
  for (const c of table.columns) {
    if (c.profile.invalid > 0)
      out.push({ level: 'warn', message: `"${c.name}": ${c.profile.invalid} value(s) could not be read as ${c.type} and are treated as blank.` })
  }
  if (dates.length > 0) {
    const di = table.columns.indexOf(dates[0])
    const ki = keys.map((k) => table.columns.indexOf(k))
    const seen = new Set<string>()
    let dupes = 0
    for (const row of table.rows) {
      const sig = [row[di], ...ki.map((i) => row[i])].join('\u0001')
      if (seen.has(sig)) dupes++
      else seen.add(sig)
    }
    if (dupes > 0)
      out.push({ level: 'ok', message: `${dupes.toLocaleString()} rows share a date${keys.length ? ' + key' : ''} with another row; they will be aggregated together.` })
  }
  if (metrics.length === 0) out.push({ level: 'ok', message: 'No metric columns. This table can still be linked as a lookup (e.g. region → country).' })
  return out
}
