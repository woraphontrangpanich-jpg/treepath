import { useMemo } from 'react'
import { computeTreeSeries, resolveTable, summarize, type NodeSummary, type TreeSeries } from '../../tree/compute'
import { validateTree, type Issue } from '../../tree/graph'
import type { Tree } from '../../tree/types'
import { useStore } from '../../state/store'

export interface TreeModel {
  series: TreeSeries
  summaries: Map<string, NodeSummary>
  issues: Issue[]
  sourceLabel: (nodeId: string) => string | undefined
}

/** Series, summaries and validation for a tree. Recomputes only when the maths changes, not on drag. */
export function useTreeModel(tree: Tree): TreeModel {
  const tables = useStore((s) => s.tables)
  const links = useStore((s) => s.links)
  const calcKey = JSON.stringify([tree.nodes.map(({ position: _p, ...rest }) => rest), tree.edges, tree.grain, tree.outcomeId])

  return useMemo(() => {
    const series = computeTreeSeries(tree, tables, links)
    const summaries = new Map(tree.nodes.map((n) => [n.id, summarize(series.byNode.get(n.id))]))
    const issues = validateTree(tree)
    const sourceLabel = (id: string) => {
      const n = tree.nodes.find((x) => x.id === id)
      if (!n?.metric) return undefined
      const t = resolveTable(tables, n.metric)
      const filters = n.metric.filters?.filter((f) => f.values.length).length
      return `${t?.name ?? n.metric.fileName} · ${n.metric.column} · ${n.metric.aggregation}${filters ? ` · ${filters} filter${filters > 1 ? 's' : ''}` : ''}`
    }
    return { series, summaries, issues, sourceLabel }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- calcKey captures every input that affects the maths
  }, [calcKey, tables, links])
}
