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
