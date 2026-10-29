import type { Aggregation, Grain } from '../data/types'

/** Restricts a metric to rows whose `column` is one of `values`; `tableId` may be a linked table. */
export interface BindingFilter {
  tableId: string
  column: string
  values: (string | number | boolean)[]
}

/** Points a node at a column of an imported table. File/sheet names let trees re-bind after re-import elsewhere. */
export interface MetricBinding {
  tableId: string
  fileName: string
  sheetName: string
  column: string
  aggregation: Aggregation
  filters?: BindingFilter[]
}

export type NodeFormat = 'percent' | 'number'

export interface TreeNode {
  id: string
  label: string
  position: { x: number; y: number }
  /** Actual data. A formula node may also have a binding, to compare the formula against reported actuals. */
  metric?: MetricBinding
  /** Expression over other nodes, e.g. `[Orders] * [Realized Price]`. Makes this a formula node. */
  formula?: string
  format?: NodeFormat
}

export type AdjustmentKind = 'pct' | 'add' | 'set'

/** One scenario assumption: change an input card by a percentage, by an amount, or set it to a value. */
export interface Assumption {
  nodeId: string
  kind: AdjustmentKind
  value: number
}

export interface Scenario {
  id: string
  name: string
  assumptions: Assumption[]
  /** Baseline = average of the last N periods. */
  baselineWindow: number
}

export type NodeKind = 'metric' | 'formula'

export function kindOf(n: TreeNode): NodeKind {
  return n.formula !== undefined ? 'formula' : 'metric'
}

/**
 * - formula / cost: generated from a formula's references (cost = subtracted term). Exact maths.
 * - driver: fitted by regression on history; propagates numbers in Scenario.
 * - influence: qualitative context; never calculates.
 */
export type EdgeRole = 'formula' | 'cost' | 'driver' | 'influence'

export interface TreeEdge {
  id: string
  /** The input (drawn below). */
  source: string
  /** The output it feeds (drawn above). */
  target: string
  role: EdgeRole
  /** Periods the effect is delayed by (driver edges). */
  lag?: number
  expectedSign?: 'positive' | 'negative'
  note?: string
}

export interface Tree {
  id: string
  name: string
  nodes: TreeNode[]
  edges: TreeEdge[]
  outcomeId?: string
  grain: Grain
  scenarios?: Scenario[]
  activeScenarioId?: string
  createdAt: string
  updatedAt: string
}

export const TREE_FILE_VERSION = 1

/** Shape of an exported `.treepath.json` file: bindings only, never raw data rows. */
export interface TreeFile {
  treepath: typeof TREE_FILE_VERSION
  tree: Tree
}
