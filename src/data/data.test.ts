import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inferColumn, parseDate, parseNumber } from './detect'
import { linkStats, suggestLinks } from './links'
import { parseWorkbook } from './parse'
import { aggregateSeries, bucketOf } from './series'
import type { Table } from './types'

const samples = join(__dirname, '..', '..', 'public', 'samples')
function load(name: string): Table[] {
  const buf = readFileSync(join(samples, name))
  return parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, name)
}

describe('detect', () => {
  it('parses numbers in common spreadsheet formats', () => {
    expect(parseNumber('1,234.5')).toEqual({ value: 1234.5, percent: false })
    expect(parseNumber('12.5%')).toEqual({ value: 0.125, percent: true })
    expect(parseNumber('฿99')?.value).toBe(99)
    expect(parseNumber('(40)')?.value).toBe(-40)
    expect(parseNumber('BKK')).toBeNull()
    expect(parseNumber('2025-01-01')).toBeNull()
  })

  it('parses ISO and slash dates and rejects impossible ones', () => {
    expect(parseDate('2025-03-07')).toBe('2025-03-07')
    expect(parseDate('07/03/2025', 'dmy')).toBe('2025-03-07')
    expect(parseDate('03/07/2025', 'mdy')).toBe('2025-03-07')
    expect(parseDate('2025-02-30')).toBeNull()
  })

  it('infers roles from type and name', () => {
    expect(inferColumn('region_code', ['BKK', 'CNX']).column.role).toBe('key')
    expect(inferColumn('Orders', [1, 2, 3]).column).toMatchObject({ role: 'metric', aggregation: 'sum' })
    expect(inferColumn('Gross Price', [12, 13]).column.aggregation).toBe('avg')
    expect(inferColumn('day', ['2025-01-01', '2025-01-02']).column.role).toBe('date')
    expect(inferColumn('country', ['TH', 'TH']).column.role).toBe('dimension')
  })

  it('resolves dd/mm vs mm/dd from the values in a column', () => {
    const { cells } = inferColumn('d', ['01/02/2025', '25/02/2025'])
    expect(cells).toEqual(['2025-02-01', '2025-02-25'])
    const us = inferColumn('d', ['02/01/2025', '02/25/2025'])
    expect(us.cells).toEqual(['2025-02-01', '2025-02-25'])
  })
})

describe('parse sample workbooks', () => {
  it('reads every sheet of marketing.xlsx with typed columns', () => {
    const tables = load('marketing.xlsx')
    expect(tables.map((t) => t.sheetName)).toEqual(['Ad Spend', 'Campaigns'])
    const ads = tables[0]
    expect(ads.rows).toHaveLength(1638)
    const byName = Object.fromEntries(ads.columns.map((c) => [c.name, c]))
    expect(byName.date).toMatchObject({ type: 'date', role: 'date' })
    expect(byName.region_code.role).toBe('key')
    expect(byName.ad_spend).toMatchObject({ type: 'number', role: 'metric', aggregation: 'sum' })
    expect(byName.voucher_coverage).toMatchObject({ format: 'percent', aggregation: 'avg' })
    expect(ads.rows[0][0]).toBe('2025-01-01')
  })

  it('reads dd/mm formatted Excel dates by value, not display text', () => {
    const sales = load('sales.xlsx')[0]
    expect(sales.columns[0]).toMatchObject({ name: 'Date', type: 'date' })
    expect(sales.columns[0].profile.min).toBe('2025-01-01')
    expect(sales.columns[0].profile.max).toBe('2026-06-30')
  })

  it('reads CSV text and types it', () => {
    const weather = load('weather.csv')[0]
    expect(weather.name).toBe('weather')
    expect(weather.columns.map((c) => c.type)).toEqual(['date', 'text', 'number'])
    const regions = load('regions.csv')[0]
    expect(regions.columns.find((c) => c.name === 'store_count')?.role).toBe('metric')
  })
})

describe('links', () => {
  const ads = load('marketing.xlsx')[0]
  const sales = load('sales.xlsx')[0]
  const regions = load('regions.csv')[0]
  const tables = [ads, sales, regions]

  it('measures match rate and cardinality', () => {
    const s = linkStats(tables, { from: { tableId: ads.id, column: 'region_code' }, to: { tableId: regions.id, column: 'region_code' } })
    expect(s).toMatchObject({ matchRate: 1, cardinality: 'many-to-one', matched: 3 })
  })

  it('suggests links by name and by matching values', () => {
    const sug = suggestLinks(tables, [])
    const pairs = sug.map((s) => `${s.from.column}->${s.to.column}:${s.reason}`)
    expect(pairs).toContain('region_code->region_code:same name')
    expect(pairs.some((p) => p.startsWith('Region->region_code') || p.startsWith('region_code->Region'))).toBe(true)
    // Dates are never suggested: tables are aligned on the date axis already.
    expect(sug.every((s) => !/date/i.test(s.from.column))).toBe(true)
  })
})

describe('series', () => {
  it('buckets dates into ISO weeks and months', () => {
    expect(bucketOf('2026-10-29', 'week')).toBe('2026-10-26') // Thursday -> Monday
    expect(bucketOf('2026-10-26', 'week')).toBe('2026-10-26')
    expect(bucketOf('2026-11-01', 'week')).toBe('2026-10-26') // Sunday -> previous Monday
    expect(bucketOf('2026-10-29', 'month')).toBe('2026-10-01')
  })

  const table: Table = {
    id: 't',
    fileName: 'x.csv',
    sheetName: 'x',
    name: 'x',
    importedAt: '',
    columns: [
      { name: 'date', type: 'date', role: 'date', aggregation: 'sum', profile: {} as never },
      { name: 'region', type: 'text', role: 'key', aggregation: 'sum', profile: {} as never },
      { name: 'v', type: 'number', role: 'metric', aggregation: 'sum', profile: {} as never },
    ],
    rows: [
      ['2026-01-01', 'A', 10],
      ['2026-01-01', 'B', 30],
      ['2026-01-02', 'A', 20],
      ['2026-02-01', 'A', null],
    ],
  }

  it('aggregates by grain and aggregation', () => {
    expect(aggregateSeries(table, 'v', { grain: 'day', aggregation: 'sum' })).toEqual([
      { date: '2026-01-01', value: 40, n: 2 },
      { date: '2026-01-02', value: 20, n: 1 },
    ])
    expect(aggregateSeries(table, 'v', { grain: 'month', aggregation: 'avg' })[0].value).toBe(20)
    expect(aggregateSeries(table, 'v', { grain: 'month', aggregation: 'last' })[0].value).toBe(20)
  })

  it('applies filters', () => {
    const s = aggregateSeries(table, 'v', { grain: 'month', aggregation: 'sum', filters: [{ column: 'region', values: ['B'] }] })
    expect(s).toEqual([{ date: '2026-01-01', value: 30, n: 1 }])
  })

  it('sums the sample ad spend to a plausible daily total', () => {
    const ads = load('marketing.xlsx')[0]
    const s = aggregateSeries(ads, 'ad_spend', { grain: 'day', aggregation: 'sum' })
    expect(s).toHaveLength(546)
    expect(s[0].n).toBe(3)
  })
})
