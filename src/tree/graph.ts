import { deductedRefs, FormulaError, formulaRefs, parseFormula, type Ast } from './formula'
import { kindOf, type EdgeRole, type Tree, type TreeEdge, type TreeNode } from './types'

export const NUMERIC_ROLES: ReadonlySet<EdgeRole> = new Set(['formula', 'cost', 'driver'])
export const FORMULA_ROLES: ReadonlySet<EdgeRole> = new Set(['formula', 'cost'])

export function findByLabel(nodes: TreeNode[], name: string) {
  const key = name.trim().toLowerCase()
  return nodes.find((n) => n.label.trim().toLowerCase() === key)
}

export type ParsedFormula = { ok: true; ast: Ast; refs: string[] } | { ok: false; error: string; pos: number }

export function tryParse(formula: string): ParsedFormula {
  try {
    const ast = parseFormula(formula)
    return { ok: true, ast, refs: formulaRefs(ast) }
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, error: e.message, pos: e.pos }
    throw e
  }
}

let edgeSeq = 0
export function newId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}_${Date.now().toString(36)}_${(edgeSeq++).toString(36)}`
}

/**
 * Formula and cost edges are derived from formulas, never drawn by hand: rebuild them so the
 * picture always matches the maths. Hand-drawn edges are kept, except where a formula now owns the pair.
 */
export function syncFormulaEdges(tree: Tree): TreeEdge[] {
  const derived: TreeEdge[] = []
  for (const n of tree.nodes) {
    if (n.formula === undefined) continue
    const parsed = tryParse(n.formula)
    if (!parsed.ok) continue
    const deducted = deductedRefs(parsed.ast)
    for (const ref of parsed.refs) {
      const src = findByLabel(tree.nodes, ref)
      if (!src || src.id === n.id) continue
      const role: EdgeRole = deducted.has(ref) ? 'cost' : 'formula'
      const old = tree.edges.find((e) => FORMULA_ROLES.has(e.role) && e.source === src.id && e.target === n.id)
      derived.push({ id: old?.id ?? newId('e'), source: src.id, target: n.id, role })
    }
  }
  const owned = new Set(derived.map((e) => `${e.source}>${e.target}`))
  const manual = tree.edges.filter((e) => !FORMULA_ROLES.has(e.role) && !owned.has(`${e.source}>${e.target}`))
  return [...derived, ...manual]
}

/** Topological order over numeric edges (inputs first). Returns the nodes stuck in cycles, if any. */
export function topoOrder(nodes: TreeNode[], edges: TreeEdge[]): { order: string[]; cyclic: string[] } {
  const indeg = new Map(nodes.map((n) => [n.id, 0]))
  const out = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    if (!NUMERIC_ROLES.has(e.role) || !indeg.has(e.source) || !indeg.has(e.target)) continue
    indeg.set(e.target, indeg.get(e.target)! + 1)
    out.get(e.source)!.push(e.target)
  }
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const t of out.get(id)!) {
      indeg.set(t, indeg.get(t)! - 1)
      if (indeg.get(t) === 0) queue.push(t)
    }
  }
  const done = new Set(order)
  return { order, cyclic: nodes.filter((n) => !done.has(n.id)).map((n) => n.id) }
}

export interface Issue {
  level: 'error' | 'warn'
  message: string
  nodeId?: string
  edgeId?: string
}

export function validateTree(tree: Tree): Issue[] {
  const issues: Issue[] = []
  const seen = new Map<string, string>()
  for (const n of tree.nodes) {
    const key = n.label.trim().toLowerCase()
    if (!key) issues.push({ level: 'error', message: 'A card has no name.', nodeId: n.id })
    else if (seen.has(key)) issues.push({ level: 'error', message: `Two cards are named "${n.label}"; formulas can't tell them apart.`, nodeId: n.id })
    else seen.set(key, n.id)

    if (n.formula !== undefined) {
      const parsed = tryParse(n.formula)
      if (!parsed.ok) issues.push({ level: 'error', message: `${n.label}: ${parsed.error}`, nodeId: n.id })
      else {
        for (const r of parsed.refs) {
          const target = findByLabel(tree.nodes, r)
          if (!target) issues.push({ level: 'error', message: `${n.label}: no card named "${r}".`, nodeId: n.id })
          else if (target.id === n.id) issues.push({ level: 'error', message: `${n.label} refers to itself.`, nodeId: n.id })
        }
      }
      const drivers = tree.edges.filter((e) => e.target === n.id && e.role === 'driver')
      if (drivers.length > 0)
        issues.push({
          level: 'error',
          message: `${n.label} is calculated by a formula, so it can't also have model-driver inputs. Point the driver at one of its inputs instead.`,
          nodeId: n.id,
        })
    }
  }

  for (const e of tree.edges) {
    const s = tree.nodes.find((n) => n.id === e.source)
    const t = tree.nodes.find((n) => n.id === e.target)
    if (!s || !t) issues.push({ level: 'error', message: 'A link points at a missing card.', edgeId: e.id })
    else if (NUMERIC_ROLES.has(e.role) && (kindOf(s) === 'note' || kindOf(t) === 'note'))
      issues.push({ level: 'warn', message: `${s.label} → ${t.label}: notes carry no numbers; use an influence link.`, edgeId: e.id })
  }

  const { cyclic } = topoOrder(tree.nodes, tree.edges)
  if (cyclic.length)
    issues.push({
      level: 'error',
      message: `Calculation loop between ${cyclic.map((id) => tree.nodes.find((n) => n.id === id)?.label).join(', ')}. Make one of the links qualitative (influence).`,
      nodeId: cyclic[0],
    })

  if (tree.nodes.length > 0 && !tree.outcomeId) issues.push({ level: 'warn', message: 'No outcome chosen. Select a card and mark it as the outcome.' })
  return issues
}
