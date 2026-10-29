import type { Cell, Column } from '../data/types'

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const plain = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })

export function formatNumber(v: number, format?: Column['format']) {
  if (format === 'percent') return `${plain.format(v * 100)}%`
  if (Math.abs(v) >= 100_000) return compact.format(v)
  return plain.format(v)
}

export function formatCell(v: Cell, column?: Pick<Column, 'format'>) {
  if (v === null) return ''
  if (typeof v === 'number') return formatNumber(v, column?.format)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return v
}

export function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
}

const short = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

/** Headline value for a metric card: compact, with % for percent metrics. */
export function formatValue(v: number | null | undefined, format?: Column['format'] | 'number') {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  if (format === 'percent') return `${(v * 100).toFixed(Math.abs(v) < 0.1 ? 2 : 1)}%`
  const a = Math.abs(v)
  if (a >= 10_000) return short.format(v)
  if (a >= 100) return v.toFixed(0)
  if (a >= 1) return v.toFixed(2)
  return v.toPrecision(3)
}

export function formatChange(c: number | null) {
  if (c === null || !Number.isFinite(c)) return null
  const pct = c * 100
  return `${pct > 0 ? '+' : ''}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`
}
