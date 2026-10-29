import type { ELK } from 'elkjs/lib/elk-api'
import type { TreeEdge, TreeNode } from './types'

// ELK is large (~1.4 MB); load it the first time a layout is requested.
let elkPromise: Promise<ELK> | null = null
function getElk() {
  elkPromise ??= import('elkjs/lib/elk.bundled.js').then((m) => new m.default())
  return elkPromise
}

export const DEFAULT_SIZE = { width: 248, height: 120 }

/** Rough card size before React Flow has measured it (formula cards show their expression). */
export function estimateSize(n: TreeNode) {
  if (n.formula !== undefined) return { width: 248, height: 120 }
  return { width: 248, height: 122 }
}

/** Return a copy of the tree's nodes with ELK positions, using estimated sizes. */
export async function withAutoLayout<T extends { nodes: TreeNode[]; edges: TreeEdge[] }>(tree: T): Promise<T> {
  const pos = await layoutTree(tree.nodes, tree.edges, new Map(tree.nodes.map((n) => [n.id, estimateSize(n)])))
  return { ...tree, nodes: tree.nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })) }
}

/**
 * Layered layout with inputs at the bottom and the outcome on top (edges point UP).
 * Sizes come from the rendered cards when known.
 */
export async function layoutTree(
  nodes: TreeNode[],
  edges: TreeEdge[],
  sizes: Map<string, { width: number; height: number }>,
): Promise<Map<string, { x: number; y: number }>> {
  const ids = new Set(nodes.map((n) => n.id))
  const elk = await getElk()
  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'UP',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.spacing.nodeNode': '40',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '80',
    },
    children: nodes.map((n) => ({ id: n.id, ...(sizes.get(n.id) ?? estimateSize(n)) })),
    edges: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  })
  const out = new Map<string, { x: number; y: number }>()
  for (const c of graph.children ?? []) out.set(c.id, { x: Math.round(c.x ?? 0), y: Math.round(c.y ?? 0) })
  return out
}
