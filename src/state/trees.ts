import { get, set } from 'idb-keyval'
import { create } from 'zustand'
import type { Grain } from '../data/types'
import { renameRef } from '../tree/formula'
import { newId, normalizeTree, syncFormulaEdges } from '../tree/graph'
import { useStore, withTimeout } from './store'
import { emptyTree } from '../tree/sample'
import { TREE_FILE_VERSION, type Assumption, type Scenario, type Tree, type TreeEdge, type TreeFile, type TreeNode } from '../tree/types'

export type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null

interface TreeState {
  hydrated: boolean
  trees: Tree[]
  activeId: string | null
  selection: Selection
  showLegend: boolean
  /** Card detail panels: per-card override, and the toolbar's show-all switch. */
  details: Record<string, boolean>
  detailsAll: boolean
  toggleDetails: (id: string) => void
  setDetailsAll: (open: boolean) => void

  newTree: (tree?: Tree) => string
  openTree: (id: string) => void
  deleteTree: (id: string) => void
  duplicateTree: (id: string) => void
  renameTree: (name: string) => void
  setGrain: (grain: Grain) => void
  setMatchKey: (ref: Tree['matchKey']) => void
  addNode: (node: Omit<TreeNode, 'id'>) => string
  updateNode: (id: string, patch: Partial<Omit<TreeNode, 'id'>>) => void
  moveNode: (id: string, position: TreeNode['position']) => void
  applyPositions: (positions: Map<string, TreeNode['position']>) => void
  removeNodes: (ids: string[]) => void
  addEdge: (edge: Omit<TreeEdge, 'id'>) => void
  updateEdge: (id: string, patch: Partial<Omit<TreeEdge, 'id' | 'source' | 'target'>>) => void
  removeEdges: (ids: string[]) => void
  setOutcome: (id: string | undefined) => void
  select: (s: Selection) => void
  toggleLegend: () => void
  importTree: (file: TreeFile) => void
  restoreTree: (tree: Tree) => void

  /** Make sure the active tree has a scenario selected; returns it. */
  ensureScenario: () => void
  setAssumption: (nodeId: string, a: Omit<Assumption, 'nodeId'> | null) => void
  clearAssumptions: () => void
  addScenario: (copyCurrent?: boolean) => void
  selectScenario: (id: string) => void
  renameScenario: (name: string) => void
  deleteScenario: (id: string) => void
  setBaselineWindow: (n: number) => void
}

export function defaultWindow(grain: Tree['grain']) {
  return grain === 'day' ? 28 : grain === 'week' ? 4 : 3
}

export function activeScenario(tree: Tree | null): Scenario | null {
  if (!tree?.scenarios?.length) return null
  return tree.scenarios.find((s) => s.id === tree.activeScenarioId) ?? tree.scenarios[0]
}

export function activeTree(s: Pick<TreeState, 'trees' | 'activeId'>) {
  return s.trees.find((t) => t.id === s.activeId) ?? null
}

/** Next free label like "Formula 2". */
export function uniqueLabel(tree: Tree, base: string) {
  const taken = new Set(tree.nodes.map((n) => n.label.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
}

export const useTrees = create<TreeState>((setState, getState) => {
  /** Apply a change to the active tree; `resync` rebuilds formula-derived edges. */
  const mutate = (fn: (t: Tree) => Tree, resync = false) =>
    setState((s) => ({
      trees: s.trees.map((t) => {
        if (t.id !== s.activeId) return t
        const next = fn(t)
        return { ...next, edges: resync ? syncFormulaEdges(next) : next.edges, updatedAt: new Date().toISOString() }
      }),
    }))

  return {
    hydrated: false,
    trees: [],
    activeId: null,
    selection: null,
    showLegend: true,
    details: {},
    detailsAll: false,
    toggleDetails: (id) => setState((s) => ({ details: { ...s.details, [id]: !(s.details[id] ?? s.detailsAll) } })),
    setDetailsAll: (detailsAll) => setState({ detailsAll, details: {} }),

    newTree: (tree) => {
      const t = tree ?? emptyTree()
      setState((s) => ({ trees: [...s.trees, t], activeId: t.id, selection: null }))
      return t.id
    },
    openTree: (activeId) => setState({ activeId, selection: null }),
    deleteTree: (id) =>
      setState((s) => {
        const trees = s.trees.filter((t) => t.id !== id)
        return { trees, activeId: s.activeId === id ? (trees.at(-1)?.id ?? null) : s.activeId, selection: null }
      }),
    duplicateTree: (id) => {
      const src = getState().trees.find((t) => t.id === id)
      if (!src) return
      const now = new Date().toISOString()
      getState().newTree({ ...structuredClone(src), id: newId('tree'), name: `${src.name} (copy)`, createdAt: now, updatedAt: now })
    },
    renameTree: (name) => mutate((t) => ({ ...t, name })),
    setGrain: (grain) => mutate((t) => ({ ...t, grain })),
    setMatchKey: (matchKey) => mutate((t) => ({ ...t, matchKey })),

    addNode: (node) => {
      const id = newId('n')
      mutate((t) => ({ ...t, nodes: [...t.nodes, { ...node, id }] }), node.formula !== undefined)
      setState({ selection: { kind: 'node', id } })
      return id
    },
    updateNode: (id, patch) =>
      mutate((t) => {
        const old = t.nodes.find((n) => n.id === id)
        let nodes = t.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n))
        // Renaming a card rewrites formulas that reference it.
        if (old && patch.label !== undefined && patch.label !== old.label && old.label.trim())
          nodes = nodes.map((n) => (n.formula ? { ...n, formula: renameRef(n.formula, old.label, patch.label!) } : n))
        return { ...t, nodes }
      }, 'formula' in patch || 'label' in patch),
    moveNode: (id, position) => mutate((t) => ({ ...t, nodes: t.nodes.map((n) => (n.id === id ? { ...n, position } : n)) })),
    applyPositions: (positions) =>
      mutate((t) => ({ ...t, nodes: t.nodes.map((n) => (positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n)) })),
    removeNodes: (ids) => {
      const gone = new Set(ids)
      const before = activeTree(getState())
      const labels = before?.nodes.filter((n) => gone.has(n.id)).map((n) => n.label) ?? []
      mutate(
        (t) => ({
          ...t,
          nodes: t.nodes.filter((n) => !gone.has(n.id)),
          edges: t.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)),
          outcomeId: t.outcomeId && gone.has(t.outcomeId) ? undefined : t.outcomeId,
        }),
        true,
      )
      setState((s) => (s.selection && gone.has(s.selection.id) ? { selection: null } : {}))
      if (before && labels.length)
        useStore.getState().notify('info', `Deleted ${labels.length === 1 ? `“${labels[0]}”` : `${labels.length} cards`}.`, {
          label: 'Undo',
          run: () => getState().restoreTree(before),
        })
    },

    addEdge: (edge) => {
      const id = newId('e')
      mutate((t) => {
        if (t.edges.some((e) => e.source === edge.source && e.target === edge.target)) return t
        return { ...t, edges: [...t.edges, { ...edge, id }] }
      })
      setState({ selection: { kind: 'edge', id } })
    },
    updateEdge: (id, patch) => mutate((t) => ({ ...t, edges: t.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
    removeEdges: (ids) => {
      const gone = new Set(ids)
      const before = activeTree(getState())
      mutate((t) => ({ ...t, edges: t.edges.filter((e) => !gone.has(e.id)) }))
      setState((s) => (s.selection && gone.has(s.selection.id) ? { selection: null } : {}))
      if (before) useStore.getState().notify('info', 'Link deleted.', { label: 'Undo', run: () => getState().restoreTree(before) })
    },
    restoreTree: (tree) => setState((s) => ({ trees: s.trees.map((t) => (t.id === tree.id ? tree : t)), selection: null })),
    setOutcome: (outcomeId) => mutate((t) => ({ ...t, outcomeId })),
    select: (selection) => setState({ selection }),
    toggleLegend: () => setState((s) => ({ showLegend: !s.showLegend })),

    ensureScenario: () =>
      mutate((t) => {
        if (t.scenarios?.length) return t.activeScenarioId ? t : { ...t, activeScenarioId: t.scenarios[0].id }
        const s: Scenario = { id: newId('s'), name: 'My scenario', assumptions: [], baselineWindow: defaultWindow(t.grain) }
        return { ...t, scenarios: [s], activeScenarioId: s.id }
      }),
    setAssumption: (nodeId, a) =>
      mutate((t) => {
        const cur = activeScenario(t)
        if (!cur) return t
        const rest = cur.assumptions.filter((x) => x.nodeId !== nodeId)
        const next = { ...cur, assumptions: a ? [...rest, { ...a, nodeId }] : rest }
        return { ...t, scenarios: t.scenarios!.map((s) => (s.id === cur.id ? next : s)) }
      }),
    clearAssumptions: () =>
      mutate((t) => {
        const cur = activeScenario(t)
        return cur ? { ...t, scenarios: t.scenarios!.map((s) => (s.id === cur.id ? { ...s, assumptions: [] } : s)) } : t
      }),
    addScenario: (copyCurrent) =>
      mutate((t) => {
        const cur = activeScenario(t)
        const n = (t.scenarios?.length ?? 0) + 1
        const s: Scenario = copyCurrent && cur
          ? { ...structuredClone(cur), id: newId('s'), name: `${cur.name} (copy)` }
          : { id: newId('s'), name: `Scenario ${n}`, assumptions: [], baselineWindow: cur?.baselineWindow ?? defaultWindow(t.grain) }
        return { ...t, scenarios: [...(t.scenarios ?? []), s], activeScenarioId: s.id }
      }),
    selectScenario: (id) => mutate((t) => ({ ...t, activeScenarioId: id })),
    renameScenario: (name) =>
      mutate((t) => {
        const cur = activeScenario(t)
        return cur ? { ...t, scenarios: t.scenarios!.map((s) => (s.id === cur.id ? { ...s, name } : s)) } : t
      }),
    deleteScenario: (id) =>
      mutate((t) => {
        const scenarios = (t.scenarios ?? []).filter((s) => s.id !== id)
        return { ...t, scenarios, activeScenarioId: t.activeScenarioId === id ? scenarios[0]?.id : t.activeScenarioId }
      }),
    setBaselineWindow: (n) =>
      mutate((t) => {
        const cur = activeScenario(t)
        return cur ? { ...t, scenarios: t.scenarios!.map((s) => (s.id === cur.id ? { ...s, baselineWindow: n } : s)) } : t
      }),

    importTree: (file) => {
      const now = new Date().toISOString()
      const t = file.tree
      getState().newTree(normalizeTree({ ...t, id: newId('tree'), name: t.name || 'Imported tree', createdAt: t.createdAt ?? now, updatedAt: now }))
    },
  }
})

export function exportTreeFile(tree: Tree): TreeFile {
  return { treepath: TREE_FILE_VERSION, tree }
}

export function parseTreeFile(text: string): TreeFile {
  const data = JSON.parse(text) as Partial<TreeFile>
  const t = data?.tree
  if (data?.treepath !== TREE_FILE_VERSION || !t || !Array.isArray(t.nodes) || !Array.isArray(t.edges))
    throw new Error('Not a Treepath tree file')
  for (const n of t.nodes) if (typeof n.id !== 'string' || typeof n.label !== 'string' || !n.position) throw new Error('Tree file has an invalid card')
  for (const e of t.edges) if (typeof e.source !== 'string' || typeof e.target !== 'string') throw new Error('Tree file has an invalid link')
  return { treepath: TREE_FILE_VERSION, tree: { ...t, grain: t.grain ?? 'day' } as Tree }
}

const KEY = 'treepath:trees:v1'

export async function hydrateTrees() {
  try {
    const saved = await withTimeout(get<{ trees: Tree[]; activeId: string | null }>(KEY))
    if (saved?.trees) useTrees.setState({ trees: saved.trees.map(normalizeTree), activeId: saved.activeId ?? saved.trees[0]?.id ?? null })
  } catch (err) {
    console.warn('Treepath: could not read saved trees', err)
  }
  useTrees.setState({ hydrated: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  useTrees.subscribe((s, prev) => {
    if (s.trees === prev.trees && s.activeId === prev.activeId) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      const { trees, activeId } = useTrees.getState()
      set(KEY, { trees, activeId }).catch((err) => console.warn('Treepath: could not save trees', err))
    }, 400)
  })
}
