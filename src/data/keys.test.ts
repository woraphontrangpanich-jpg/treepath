import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fitAll, type DriverModel } from '../model/drivers'
import { runScenario } from '../model/scenario'
import { computeTreeSeries } from '../tree/compute'
import { buildSampleTree } from '../tree/sample'
import { keyCoverage, resolveKeys } from './keys'
import { hasLink, orientLink, suggestLinks } from './links'
import { parseWorkbook } from './parse'
import type { Link, Table } from './types'

const samples = join(__dirname, '..', '..', 'public', 'samples')
function load(name: string): Table[] {
  const buf = readFileSync(join(samples, name))
  return parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, name)
}

const tables = [...load('marketing.xlsx'), ...load('sales.xlsx'), ...load('weather.csv'), ...load('regions.csv')]
const t = (file: string) => tables.find((x) => x.fileName === file)!
const links: Link[] = suggestLinks(tables, [])
  .filter((s) => s.stats.matchRate === 1)
  .map((s, i) => ({ id: `l${i}`, from: s.from, to: s.to }))
const ref = { tableId: t('regions.csv').id, column: 'region_code' }

describe('key matching across files', () => {
  it('links keys with different column names and different values', () => {
    const pairs = links.map((l) => `${tables.find((x) => x.id === l.from.tableId)!.fileName}.${l.from.column}→${l.to.column}`)
    expect(pairs).toContain('marketing.xlsx.region_code→region_code')
    expect(pairs).toContain('sales.xlsx.Region→region_code')
    expect(pairs).toContain('weather.csv.city→region_name') // "Bangkok" matches by value, not by name
  })

  it('translates every file onto one canonical key', () => {
    const res = resolveKeys(tables, links, ref)!
    expect(res.keys).toEqual(['BKK', 'CNX', 'HKT'])
    expect(res.byTable.get(t('sales.xlsx').id)!.map.get('bkk')).toBe('BKK')
    // weather.city is translated through the regions lookup: Bangkok → BKK.
    const w = res.byTable.get(t('weather.csv').id)!
    expect(w.column).toBe('city')
    expect(w.map.get('bangkok')).toBe('BKK')
    expect(w.map.get('phuket')).toBe('HKT')
  })

  it('ignores a stale link to a column that no longer exists', () => {
    // e.g. weather.csv was re-imported and its "region_code" header became "city".
    const stale: Link[] = [{ id: 'old', from: { tableId: t('weather.csv').id, column: 'region_code' }, to: ref }, ...links]
    const w = resolveKeys(tables, stale, ref)!.byTable.get(t('weather.csv').id)!
    expect(w.column).toBe('city')
    expect(w.map.get('bangkok')).toBe('BKK')
  })

  it('reports full coverage with no unmatched rows', () => {
    const cov = keyCoverage(tables, resolveKeys(tables, links, ref)!)
    const weather = cov.find((c) => c.tableId === t('weather.csv').id)!
    expect(weather.matchedRows).toBe(weather.rows)
    expect(weather.perKey.get('CNX')).toBe(546)
    expect(cov.every((c) => c.unmatched.length === 0)).toBe(true)
  })

  it('flags rows whose key has no match', () => {
    const extra: Table = { ...t('sales.xlsx'), id: 'dirty', rows: [...t('sales.xlsx').rows.slice(0, 3), ['2025-01-01', 'XYZ', 1, 1, 1, 0.5, 1, 1]] }
    const l2: Link[] = [...links, { id: 'x', from: { tableId: 'dirty', column: 'Region' }, to: ref }]
    const cov = keyCoverage([...tables, extra], resolveKeys([...tables, extra], l2, ref)!)
    const c = cov.find((x) => x.tableId === 'dirty')!
    expect(c.matchedRows).toBe(3)
    expect(c.unmatched).toEqual(['XYZ'])
  })
})

describe('regression matched by date and key', () => {
  const tree = buildSampleTree(tables)!
  const series = computeTreeSeries(tree, tables, links)
  const models = fitAll(tree, series)
  const orders = tree.nodes.find((n) => n.label === 'Orders')!

  it('splits cards per region, including formulas', () => {
    expect(tree.matchKey).toEqual(ref)
    expect([...series.byNode.get(orders.id)!.panel!.keys()]).toEqual(['BKK', 'CNX', 'HKT'])
    const rain = tree.nodes.find((n) => n.label === 'Rain Index')!
    expect(series.byNode.get(rain.id)!.panel!.get('HKT')!.length).toBe(546)
    const revenue = tree.nodes.find((n) => n.label === 'Revenue')!
    expect(series.byNode.get(revenue.id)!.panel!.size).toBe(3)
  })

  it('fits on stacked region rows with an F test', () => {
    const m = models.get(orders.id) as DriverModel
    expect(m.ok).toBe(true)
    expect(m.keys).toBe(3)
    expect(m.n).toBeGreaterThan(1500) // ~3 regions × 544 days
    expect(m.fStat).toBeGreaterThan(10)
    expect(m.fP).toBeLessThan(1e-6)
    const ad = m.terms.find((x) => x.label === 'Ad Spend')!
    expect(ad.p).toBeLessThan(1e-6)
    expect(ad.coef).toBeGreaterThan(0.15)
    expect(ad.coef).toBeLessThan(0.5)
  })

  it('still forecasts on totals with the per-region effect', () => {
    const r = runScenario(tree, series, models, [{ nodeId: tree.nodes.find((n) => n.label === 'Ad Spend')!.id, kind: 'pct', value: 20 }], 28)
    expect(r.evidence).toBe('model')
    expect(r.outcome!.delta).toBeGreaterThan(0)
  })
})

describe('links drawn by hand', () => {
  it('points at the lookup whichever end you start from', () => {
    const sales = { tableId: t('sales.xlsx').id, column: 'Region' }
    expect(orientLink(tables, ref, sales)).toEqual({ from: sales, to: ref })
    expect(orientLink(tables, sales, ref)).toEqual({ from: sales, to: ref })
    expect(hasLink(links, ref, sales)).toBe(true)
  })
})
