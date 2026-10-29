import type { Aggregation, Cell, Column, ColumnProfile, ColumnRole, ColumnType } from './types'

/** A raw value as read from a sheet, before type inference. */
export type RawValue = string | number | boolean | null | { date: string }

const NUMBER_RE = /^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?$/
const CURRENCY_RE = /^[$€£¥฿₩₹]|[$€£¥฿₩₹]$|\s?(THB|USD|EUR)$/i
const ISO_DATE_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/
const SLASH_DATE_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T].*)?$/

export function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n)
}

function validDate(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** Parse a numeric string like "1,234.5", "฿99", "12.5%". Returns null when not numeric. */
export function parseNumber(s: string): { value: number; percent: boolean } | null {
  let t = s.trim()
  if (!t) return null
  let percent = false
  if (t.endsWith('%')) {
    percent = true
    t = t.slice(0, -1).trim()
  }
  t = t.replace(CURRENCY_RE, '').trim()
  let negative = false
  if (/^\(.*\)$/.test(t)) {
    negative = true
    t = t.slice(1, -1)
  }
  if (!t || !NUMBER_RE.test(t)) return null
  let v = Number(t.replace(/,/g, ''))
  if (!Number.isFinite(v)) return null
  if (negative) v = -v
  if (percent) v /= 100
  return { value: v, percent }
}

export type DateOrder = 'dmy' | 'mdy'

/** Parse a date string. `order` resolves ambiguous dd/mm vs mm/dd forms. */
export function parseDate(s: string, order: DateOrder = 'dmy'): string | null {
  const t = s.trim()
  let m = ISO_DATE_RE.exec(t)
  if (m) return validDate(+m[1], +m[2], +m[3])
  m = SLASH_DATE_RE.exec(t)
  if (m) {
    let y = +m[3]
    if (y < 100) y += 2000
    const [a, b] = [+m[1], +m[2]]
    return order === 'dmy' ? validDate(y, b, a) : validDate(y, a, b)
  }
  return null
}

/** Decide dd/mm vs mm/dd for a column of slash dates by looking for values > 12. */
export function detectDateOrder(values: string[]): DateOrder {
  let dmy = 0
  let mdy = 0
  for (const v of values) {
    const m = SLASH_DATE_RE.exec(v.trim())
    if (!m) continue
    if (+m[1] > 12) dmy++
    if (+m[2] > 12) mdy++
  }
  return mdy > dmy ? 'mdy' : 'dmy'
}

const BOOL_TRUE = new Set(['true', 'yes', 'y'])
const BOOL_FALSE = new Set(['false', 'no', 'n'])

const KEY_NAME_RE = /(^|[_\s-])(id|key|code|sku|no|number)$|^(id|key|code)$/i
const AVG_NAME_RE = /(rate|ratio|pct|percent|%|price|avg|average|mean|index|coverage|discount|share|margin|per[_\s]|score|temperature)/i

/**
 * Infer type, role and aggregation for one column and convert its raw values to cells.
 * `percentHint` is true when the source cells carried a % number format.
 */
export function inferColumn(
  name: string,
  raw: RawValue[],
  percentHint = false,
): { column: Omit<Column, 'profile'>; cells: Cell[] } {
  let nonNull = 0
  let nums = 0
  let dates = 0
  let bools = 0
  let percentStrings = 0
  const strings: string[] = []

  for (const v of raw) {
    if (v === null || v === '') continue
    nonNull++
    if (typeof v === 'number') nums++
    else if (typeof v === 'boolean') bools++
    else if (typeof v === 'object') dates++
    else {
      strings.push(v)
      const lower = v.trim().toLowerCase()
      if (BOOL_TRUE.has(lower) || BOOL_FALSE.has(lower)) bools++
      const n = parseNumber(v)
      if (n) {
        nums++
        if (n.percent) percentStrings++
      } else if (parseDate(v, 'dmy') || parseDate(v, 'mdy')) dates++
    }
  }

  const order = detectDateOrder(strings)
  const share = (k: number) => (nonNull === 0 ? 0 : k / nonNull)
  let type: ColumnType
  if (nonNull === 0) type = 'empty'
  else if (share(dates) >= 0.9) type = 'date'
  else if (share(bools) >= 0.9 && bools > nums) type = 'boolean'
  else if (share(nums) >= 0.9) type = 'number'
  else type = 'text'

  const cells: Cell[] = raw.map((v) => convert(v, type, order))

  let role: ColumnRole
  if (type === 'date') role = 'date'
  else if (type === 'empty') role = 'ignore'
  else if (KEY_NAME_RE.test(name.trim())) role = 'key'
  else if (type === 'number') role = 'metric'
  else role = 'dimension'

  const aggregation: Aggregation = role === 'metric' && (AVG_NAME_RE.test(name) || percentHint || percentStrings > 0) ? 'avg' : 'sum'
  const format = percentHint || percentStrings > 0 ? 'percent' : undefined

  return { column: { name, type, role, aggregation, ...(format ? { format } : {}) }, cells }
}

function convert(v: RawValue, type: ColumnType, order: DateOrder): Cell {
  if (v === null || v === '') return null
  switch (type) {
    case 'date':
      if (typeof v === 'object') return v.date
      if (typeof v === 'string') return parseDate(v, order)
      return null
    case 'number':
      if (typeof v === 'number') return v
      if (typeof v === 'string') return parseNumber(v)?.value ?? null
      if (typeof v === 'boolean') return v ? 1 : 0
      return null
    case 'boolean': {
      if (typeof v === 'boolean') return v
      if (typeof v === 'number') return v !== 0
      if (typeof v === 'string') {
        const lower = v.trim().toLowerCase()
        if (BOOL_TRUE.has(lower)) return true
        if (BOOL_FALSE.has(lower)) return false
      }
      return null
    }
    case 'text':
      if (typeof v === 'object') return v.date
      return String(v).trim()
    default:
      return null
  }
}

export function profileColumn(raw: RawValue[], cells: Cell[]): ColumnProfile {
  let count = 0
  let nulls = 0
  let invalid = 0
  let min: Cell = null
  let max: Cell = null
  const distinct = new Set<Cell>()
  const samples: Cell[] = []
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (c === null) {
      nulls++
      if (raw[i] !== null && raw[i] !== '') invalid++
      continue
    }
    count++
    if (distinct.size < 100_000) distinct.add(c)
    if (samples.length < 5 && !samples.includes(c)) samples.push(c)
    if (typeof c === 'number' || typeof c === 'string') {
      if (min === null || c < (min as typeof c)) min = c
      if (max === null || c > (max as typeof c)) max = c
    }
  }
  return { count, nulls, invalid, distinct: distinct.size, min, max, samples }
}
