import type { Aggregation, Table } from '../data/types'
import { newId, syncFormulaEdges } from './graph'
import type { MetricBinding, Tree, TreeEdge, TreeNode } from './types'

function bind(tables: Table[], fileName: string, column: string, aggregation?: Aggregation): MetricBinding | undefined {
  const t = tables.find((x) => x.fileName === fileName && x.columns.some((c) => c.name === column && c.role === 'metric'))
  if (!t) return undefined
  const col = t.columns.find((c) => c.name === column)!
  return { tableId: t.id, fileName: t.fileName, sheetName: t.sheetName, column, aggregation: aggregation ?? col.aggregation }
}

export function emptyTree(name = 'Untitled tree'): Tree {
  const now = new Date().toISOString()
  return { id: newId('tree'), name, nodes: [], edges: [], grain: 'day', createdAt: now, updatedAt: now }
}

export function hasSampleTables(tables: Table[]) {
  return !!bind(tables, 'sales.xlsx', 'Orders') && !!bind(tables, 'marketing.xlsx', 'ad_spend')
}

/**
 * The Net Revenue tree for the bundled sample workbooks: exact formulas on top,
 * fitted drivers (ad spend, vouchers, rain → orders) underneath.
 */
export function buildSampleTree(tables: Table[]): Tree | null {
  if (!hasSampleTables(tables)) return null
  const tree = emptyTree('Net Revenue — sample')
  const node = (label: string, x: number, y: number, extra: Partial<TreeNode>): TreeNode => ({ id: newId('n'), label, position: { x, y }, ...extra })

  const nodes: TreeNode[] = [
    node('Net Revenue', 520, 0, { formula: '[Revenue] - [Orders] * [Cost per Order] - [Ad Spend]' }),
    node('Revenue', 240, 170, { formula: '[Orders] * [Realized Price]', metric: bind(tables, 'sales.xlsx', 'Revenue') }),
    node('Realized Price', 120, 340, { formula: '[Gross Price] - [Voucher Used Orders] * [Gross Price] * [Voucher Discount %] / [Orders]' }),
    node('Cost per Order', 800, 340, { metric: bind(tables, 'sales.xlsx', 'Cost per Order') }),
    node('Orders', 520, 340, { metric: bind(tables, 'sales.xlsx', 'Orders') }),
    node('Gross Price', 0, 520, { metric: bind(tables, 'sales.xlsx', 'Gross Price') }),
    node('Voucher Used Orders', 240, 520, { metric: bind(tables, 'sales.xlsx', 'Voucher Used Orders') }),
    node('Voucher Discount %', 480, 680, { metric: bind(tables, 'marketing.xlsx', 'voucher_discount_pct'), format: 'percent' }),
    node('Voucher Coverage', 240, 680, { metric: bind(tables, 'marketing.xlsx', 'voucher_coverage'), format: 'percent' }),
    node('Ad Spend', 800, 680, { metric: bind(tables, 'marketing.xlsx', 'ad_spend') }),
    node('Rain Index', 1040, 680, { metric: bind(tables, 'weather.csv', 'rain_index') }),
    node('Campaign calendar', 1040, 520, { note: 'Big campaigns (Songkran, 11.11, New Year) lift ad spend; see marketing › Campaigns.' }),
  ]
  const byLabel = (l: string) => nodes.find((n) => n.label === l)!.id
  const manual: TreeEdge[] = [
    { id: newId('e'), source: byLabel('Ad Spend'), target: byLabel('Orders'), role: 'driver', lag: 1, expectedSign: 'positive' },
    { id: newId('e'), source: byLabel('Voucher Coverage'), target: byLabel('Orders'), role: 'driver', expectedSign: 'positive' },
    { id: newId('e'), source: byLabel('Rain Index'), target: byLabel('Orders'), role: 'driver', expectedSign: 'negative' },
    { id: newId('e'), source: byLabel('Voucher Coverage'), target: byLabel('Voucher Used Orders'), role: 'leading' },
    { id: newId('e'), source: byLabel('Campaign calendar'), target: byLabel('Ad Spend'), role: 'influence' },
  ]
  const full: Tree = { ...tree, nodes, edges: manual, outcomeId: byLabel('Net Revenue') }
  return { ...full, edges: syncFormulaEdges(full) }
}
