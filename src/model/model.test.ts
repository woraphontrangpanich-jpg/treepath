import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/parse'
import type { Table } from '../data/types'
import { computeTreeSeries } from '../tree/compute'
import { buildSampleTree } from '../tree/sample'
import type { Tree } from '../tree/types'
import { fitAll, type DriverModel } from './drivers'
import { ols, vif } from './regression'
import { parseChange, runScenario, substitute } from './scenario'
import { invert, quantile, tPValue } from './stats'

const samples = join(__dirname, '..', '..', 'public', 'samples')
function load(name: string): Table[] {
  const buf = readFileSync(join(samples, name))
  return parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, name)
}

describe('stats', () => {
  it('inverts matrices and rejects singular ones', () => {
    const i = invert([
      [4, 7],
      [2, 6],
    ])!
    expect(i[0][0]).toBeCloseTo(0.6)
    expect(i[1][0]).toBeCloseTo(-0.2)
    expect(
      invert([
        [1, 2],
        [2, 4],
      ]),
    ).toBeNull()
  })

  it('computes t-distribution p-values', () => {
    expect(tPValue(0, 10)).toBeCloseTo(1)
    expect(tPValue(2.228, 10)).toBeCloseTo(0.05, 3)
    expect(tPValue(1.96, 100000)).toBeCloseTo(0.05, 3)
  })

  it('interpolates quantiles', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(quantile([0, 10], 0.25)).toBe(2.5)
  })
})

describe('ols', () => {
  it('recovers known coefficients', () => {
    const x: number[][] = []
    const y: number[] = []
    for (let i = 0; i < 200; i++) {
      const a = Math.sin(i)
      const b = Math.cos(i * 0.7)
      x.push([a, b])
      y.push(3 + 2 * a - 1.5 * b + 0.01 * Math.sin(i * 13))
    }
    const r = ols(x, y)!
    expect(r.coef[0]).toBeCloseTo(3, 2)
    expect(r.coef[1]).toBeCloseTo(2, 2)
    expect(r.coef[2]).toBeCloseTo(-1.5, 2)
    expect(r.r2).toBeGreaterThan(0.999)
    expect(r.p[1]).toBeLessThan(1e-6)
    expect(vif(x).every((v) => v < 2)).toBe(true)
  })
})

describe('drivers and scenario on the sample tree', () => {
  const tables = [...load('marketing.xlsx'), ...load('sales.xlsx'), ...load('weather.csv'), ...load('regions.csv')]
  const tree = buildSampleTree(tables)!
  const series = computeTreeSeries(tree, tables, [])
  const models = fitAll(tree, series)
  const id = (label: string) => tree.nodes.find((n) => n.label === label)!.id

  it('fits Orders from its drivers with the expected signs', () => {
    const m = models.get(id('Orders')) as DriverModel
    expect(m.ok).toBe(true)
    expect(m.type).toBe('change')
    expect(m.targetTransform).toBe('log')
    const ad = m.terms.find((t) => t.label === 'Ad Spend')!
    const rain = m.terms.find((t) => t.label === 'Rain Index')!
    const cov = m.terms.find((t) => t.label === 'Voucher Coverage')!
    expect(ad.transform).toBe('log')
    expect(cov.transform).toBe('logit')
    expect(rain.transform).toBe('raw') // dry days have rain = 0, so no log scale
    // Generated with elasticity 0.28, but ad spend's weekly cycle overlaps the weekend lift in orders,
    // so the fit absorbs some of it (omitted-variable bias). A weekday driver would remove that.
    expect(ad.coef).toBeGreaterThan(0.15)
    expect(ad.coef).toBeLessThan(0.5)
    expect(ad.p).toBeLessThan(0.001)
    expect(m.walkForward!.directionHit).toBeGreaterThan(0.5)
    // Lag scan should find the true 1-day lag strongest for ad spend.
    const best = [...ad.lagScan].sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0]
    expect(best.lag).toBe(1)
  })

  it('returns exactly the baseline when nothing changes', () => {
    const r = runScenario(tree, series, models, [], 28)
    expect(r.evidence).toBe('no-change')
    expect(r.path).toEqual([])
    expect(r.outcome!.delta).toBe(0)
  })

  it('propagates an Ad Spend increase through the model and the formulas', () => {
    const r = runScenario(tree, series, models, [{ nodeId: id('Ad Spend'), kind: 'pct', value: 20 }], 28)
    const orders = r.nodes.get(id('Orders'))!
    const ad = (models.get(id('Orders')) as DriverModel).terms.find((t) => t.label === 'Ad Spend')!
    expect(orders.how).toBe('model')
    expect(orders.value / orders.base).toBeCloseTo(Math.exp(ad.coef * Math.log(1.2)), 6)
    expect(r.nodes.get(id('Revenue'))!.delta).toBeGreaterThan(0)
    // Voucher orders scale with orders, so the voucher share and realized price stay put.
    expect(r.nodes.get(id('Voucher Used Orders'))!.pct).toBeCloseTo(orders.pct!, 9)
    expect(r.nodes.get(id('Realized Price'))!.affected).toBe(false)
    expect(r.evidence).toBe('model')
    expect(r.path[0]).toBe(id('Ad Spend'))
    expect(r.path.at(-1)).toBe(tree.outcomeId)
    // Contributions add up to the total outcome change.
    const total = r.contributions.reduce((s, c) => s + c.delta, 0)
    expect(total).toBeCloseTo(r.outcome!.delta, 6)
    expect(r.range!.p5).toBeLessThanOrEqual(r.outcome!.value)
    expect(r.range!.p95).toBeGreaterThanOrEqual(r.outcome!.value)
  })

  it('uses exact formulas only for a cost input', () => {
    const r = runScenario(tree, series, models, [{ nodeId: id('Cost per Order'), kind: 'add', value: 0.5 }], 28)
    expect(r.evidence).toBe('formula')
    expect(r.range).toBeNull()
    const orders = r.nodes.get(id('Orders'))!.base
    expect(r.outcome!.delta).toBeCloseTo(-0.5 * orders, 6)
  })

  it('reports an interaction when two inputs change together', () => {
    const r = runScenario(
      tree,
      series,
      models,
      [
        { nodeId: id('Ad Spend'), kind: 'pct', value: 20 },
        { nodeId: id('Cost per Order'), kind: 'pct', value: 10 },
      ],
      28,
    )
    expect(r.contributions).toHaveLength(3)
    expect(r.contributions.reduce((s, c) => s + c.delta, 0)).toBeCloseTo(r.outcome!.delta, 6)
  })

  it('substitutes values into formulas for the calculation trace', () => {
    const t: Tree = tree
    const vals = new Map([
      [id('Orders'), 10],
      [id('Realized Price'), 2],
    ])
    expect(substitute('[Orders] * [Realized Price]', t, vals, (_, v) => String(v))).toBe('10 * 2')
  })
})

describe('parseChange', () => {
  const tables = [...load('marketing.xlsx'), ...load('sales.xlsx'), ...load('weather.csv')]
  const tree = buildSampleTree(tables)!
  const id = (label: string) => tree.nodes.find((n) => n.label === label)!.id

  it.each([
    ['increase Ad Spend 20%', 'Ad Spend', 'pct', 20],
    ['Increase ads spend by 20 %', 'Ad Spend', 'pct', 20],
    ['reduce cost per order by 0.5', 'Cost per Order', 'add', -0.5],
    ['set Voucher Coverage to 15%', 'Voucher Coverage', 'set', 0.15],
    ['increase voucher coverage by 2 points', 'Voucher Coverage', 'add', 0.02],
    ['Rain Index -10%', 'Rain Index', 'pct', -10],
    ['ad spend +500', 'Ad Spend', 'add', 500],
  ])('%s', (text, label, kind, value) => {
    const r = parseChange(text, tree)
    if (label === 'Ad Spend' && text.includes('ads spend')) {
      // "ads spend" is not a card name; it should fail clearly rather than guess.
      expect(r.ok).toBe(false)
      return
    }
    expect(r).toMatchObject({ ok: true, assumption: { nodeId: id(label), kind } })
    if (r.ok) expect(r.assumption.value).toBeCloseTo(value as number)
  })

  it('rejects formula cards and unknown names', () => {
    expect(parseChange('increase Revenue 10%', tree).ok).toBe(false)
    expect(parseChange('increase Moon 10%', tree).ok).toBe(false)
    expect(parseChange('make it better', tree).ok).toBe(false)
  })
})
