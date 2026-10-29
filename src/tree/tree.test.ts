import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWorkbook } from '../data/parse'
import type { Table } from '../data/types'
import { computeTreeSeries, summarize } from './compute'
import { deductedRefs, evaluate, formulaRefs, parseFormula, renameRef } from './formula'
import { syncFormulaEdges, topoOrder, validateTree } from './graph'
import { buildSampleTree, emptyTree } from './sample'
import type { Tree } from './types'

const samples = join(__dirname, '..', '..', 'public', 'samples')
function load(name: string): Table[] {
  const buf = readFileSync(join(samples, name))
  return parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, name)
}

describe('formula', () => {
  const env = (vals: Record<string, number>) => (n: string) => vals[n]

  it('respects precedence, unary minus, powers and functions', () => {
    expect(evaluate(parseFormula('1 + 2 * 3'), env({}))).toBe(7)
    expect(evaluate(parseFormula('(1 + 2) * 3'), env({}))).toBe(9)
    expect(evaluate(parseFormula('-2 ^ 2'), env({}))).toBe(-4)
    expect(evaluate(parseFormula('2 ^ 3 ^ 2'), env({}))).toBe(512)
    expect(evaluate(parseFormula('max(1, [A], 3) + abs(-2)'), env({ A: 5 }))).toBe(7)
    expect(evaluate(parseFormula('10%'), env({}))).toBeCloseTo(0.1)
    expect(evaluate(parseFormula('[Orders] × @Price'), env({ Orders: 4, Price: 2.5 }))).toBe(10)
  })

  it('rejects unsafe or malformed input instead of evaluating it', () => {
    expect(() => parseFormula('alert(1)')).toThrow(/Unknown name/)
    expect(() => parseFormula('[A] +')).toThrow(/ends unexpectedly/)
    expect(() => parseFormula('[A')).toThrow(/Missing closing/)
    expect(() => parseFormula('abs(1, 2)')).toThrow(/argument/)
    expect(() => parseFormula('constructor')).toThrow()
  })

  it('finds references and deducted terms', () => {
    const ast = parseFormula('[Revenue] - [Orders] * [Cost per Order] - [Ad Spend]')
    expect(formulaRefs(ast)).toEqual(['Revenue', 'Orders', 'Cost per Order', 'Ad Spend'])
    expect([...deductedRefs(ast)].sort()).toEqual(['Ad Spend', 'Cost per Order', 'Orders'])
    expect([...deductedRefs(parseFormula('[A] - [B] + [B]'))]).toEqual([])
  })

  it('renames references', () => {
    expect(renameRef('[Ads] * 2 + @Ads', 'Ads', 'Ad Spend')).toBe('[Ad Spend] * 2 + [Ad Spend]')
    expect(renameRef('[Adsx] + [ ads ]', 'ads', 'X')).toBe('[Adsx] + [X]')
  })
})

describe('graph', () => {
  function tree(nodes: Partial<Tree['nodes'][number]>[]): Tree {
    return {
      ...emptyTree(),
      nodes: nodes.map((n, i) => ({ id: `n${i}`, label: `N${i}`, position: { x: 0, y: 0 }, ...n })),
    }
  }

  it('derives formula and cost edges and keeps manual ones', () => {
    const t = tree([{ label: 'A' }, { label: 'B' }, { label: 'C', formula: '[A] - [B]' }])
    t.edges = [{ id: 'm', source: 'n0', target: 'n1', role: 'influence' }]
    const edges = syncFormulaEdges(t)
    expect(edges.map((e) => `${e.source}>${e.target}:${e.role}`).sort()).toEqual(['n0>n1:influence', 'n0>n2:formula', 'n1>n2:cost'])
  })

  it('detects cycles, unknown refs, duplicates and driver-on-formula', () => {
    const t = tree([
      { label: 'A', formula: '[B] + 1' },
      { label: 'B', formula: '[A] * 2' },
      { label: 'C', formula: '[Nope]' },
      { label: 'c' },
    ])
    t.edges = [...syncFormulaEdges(t), { id: 'd', source: 'n3', target: 'n0', role: 'driver' }]
    const msgs = validateTree(t).map((i) => i.message)
    expect(msgs.some((m) => m.includes('Calculation loop'))).toBe(true)
    expect(msgs.some((m) => m.includes('no card named "Nope"'))).toBe(true)
    expect(msgs.some((m) => m.includes('Two cards are named'))).toBe(true)
    expect(msgs.some((m) => m.includes("can't also have model-driver"))).toBe(true)
    expect(topoOrder(t.nodes, t.edges).cyclic.sort()).toEqual(['n0', 'n1'])
  })
})

describe('sample tree on sample data', () => {
  const tables = [...load('marketing.xlsx'), ...load('sales.xlsx'), ...load('weather.csv'), ...load('regions.csv')]
  const t = buildSampleTree(tables)!

  it('builds a valid tree', () => {
    expect(t).not.toBeNull()
    expect(validateTree(t).filter((i) => i.level === 'error')).toEqual([])
    const roles = t.edges.map((e) => e.role)
    // Net Revenue deducts Orders·CPO and Ad Spend; Realized Price deducts the voucher terms.
    expect(roles.filter((r) => r === 'cost')).toHaveLength(6)
    expect(roles.filter((r) => r === 'driver')).toHaveLength(3)
  })

  it('computes formula series that reconcile with reported revenue', () => {
    const { byNode, lastDate } = computeTreeSeries(t, tables, [])
    expect(lastDate).toBe('2026-06-30')
    const rev = t.nodes.find((n) => n.label === 'Revenue')!
    const s = byNode.get(rev.id)!
    expect(s.error).toBeUndefined()
    expect(s.points).toHaveLength(546)
    const sum = summarize(s)
    // Gross Price is an unweighted mean across regions, so the formula drifts a few % from reported revenue.
    expect(Math.abs(sum.gap! / s.actual!.at(-1)!.value)).toBeLessThan(0.06)
    const net = byNode.get(t.outcomeId!)!
    expect(net.points.at(-1)!.value).toBeGreaterThan(0)
  })

  it('drops partial final weeks and months', () => {
    const weekly = computeTreeSeries({ ...t, grain: 'week' }, tables, [])
    const orders = weekly.byNode.get(t.nodes.find((n) => n.label === 'Orders')!.id)!
    expect(orders.points.at(-1)!.date).toBe('2026-06-22') // week of 06-29 ends 07-05, after the data
    const monthly = computeTreeSeries({ ...t, grain: 'month' }, tables, [])
    expect(monthly.byNode.get(t.outcomeId!)!.points.at(-1)!.date).toBe('2026-06-01')
  })

  it('filters through a table link', () => {
    const regions = tables.find((x) => x.fileName === 'regions.csv')!
    const sales = tables.find((x) => x.fileName === 'sales.xlsx')!
    const orders = t.nodes.find((n) => n.label === 'Orders')!
    const filtered: Tree = {
      ...t,
      nodes: t.nodes.map((n) =>
        n.id === orders.id ? { ...n, metric: { ...n.metric!, filters: [{ tableId: regions.id, column: 'region_name', values: ['Bangkok'] }] } } : n,
      ),
    }
    const link = { id: 'l', from: { tableId: sales.id, column: 'Region' }, to: { tableId: regions.id, column: 'region_code' } }
    const all = computeTreeSeries(t, tables, [link]).byNode.get(orders.id)!.points[0].value
    const bkk = computeTreeSeries(filtered, tables, [link]).byNode.get(orders.id)!.points[0].value
    expect(bkk).toBeLessThan(all)
    expect(bkk).toBeGreaterThan(all / 2)
    expect(computeTreeSeries(filtered, tables, []).byNode.get(orders.id)!.error).toMatch(/No link/)
  })
})
