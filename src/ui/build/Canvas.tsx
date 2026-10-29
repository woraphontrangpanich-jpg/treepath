import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ScenarioResult } from '../../model/scenario'
import { useStore } from '../../state/store'
import { useTrees, uniqueLabel } from '../../state/trees'
import { NUMERIC_ROLES } from '../../tree/graph'
import { ROLES } from '../../tree/roles'
import { kindOf, type Tree } from '../../tree/types'
import { Legend } from './Legend'
import { NodeCard, type CardNode } from './NodeCard'
import { RoleEdge, type RoleFlowEdge } from './RoleEdge'
import type { TreeModel } from './useTreeModel'

const nodeTypes = { card: NodeCard }
const edgeTypes = { role: RoleEdge }

export const DND_MIME = 'application/x-treepath'
export type DragPayload = { kind: 'metric'; tableId: string; column: string } | { kind: 'formula' } | { kind: 'note' }

export function useAddFromPayload() {
  const tables = useStore((s) => s.tables)
  const addNode = useTrees((s) => s.addNode)
  return useCallback(
    (tree: Tree, p: DragPayload, position: { x: number; y: number }) => {
      if (p.kind === 'metric') {
        const t = tables.find((x) => x.id === p.tableId)
        const col = t?.columns.find((c) => c.name === p.column)
        if (!t || !col) return
        const pretty = col.name.replace(/[_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
        addNode({
          label: uniqueLabel(tree, pretty),
          position,
          metric: { tableId: t.id, fileName: t.fileName, sheetName: t.sheetName, column: col.name, aggregation: col.aggregation },
          ...(col.format ? { format: col.format } : {}),
        })
      } else if (p.kind === 'formula') addNode({ label: uniqueLabel(tree, 'New formula'), position, formula: '' })
      else addNode({ label: uniqueLabel(tree, 'Note'), position, note: '' })
    },
    [tables, addNode],
  )
}

export function Canvas({ tree, model, scenario }: { tree: Tree; model: TreeModel; scenario?: ScenarioResult }) {
  const readOnly = !!scenario
  const onPath = scenario && scenario.path.length > 0 ? new Set(scenario.path) : null
  const selection = useTrees((s) => s.selection)
  const { select, moveNode, removeNodes, removeEdges, addEdge } = useTrees.getState()
  const notify = useStore((s) => s.notify)
  const { screenToFlowPosition } = useReactFlow()
  const addFromPayload = useAddFromPayload()

  const issueByNode = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of model.issues) if (i.nodeId && i.level === 'error' && !m.has(i.nodeId)) m.set(i.nodeId, i.message)
    return m
  }, [model.issues])

  const built = useMemo<CardNode[]>(
    () =>
      tree.nodes.map((n) => ({
        id: n.id,
        type: 'card',
        position: n.position,
        selected: selection?.kind === 'node' && selection.id === n.id,
        data: {
          node: n,
          kind: kindOf(n),
          series: model.series.byNode.get(n.id),
          summary: model.summaries.get(n.id)!,
          isOutcome: tree.outcomeId === n.id,
          issue: issueByNode.get(n.id),
          source: kindOf(n) === 'metric' && !scenario ? model.sourceLabel(n.id) : undefined,
          scenario: scenario?.nodes.get(n.id),
          dimmed: !!onPath && !onPath.has(n.id),
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPath derives from scenario
    [tree.nodes, tree.outcomeId, selection, model, issueByNode, scenario],
  )

  // Local copy so React Flow keeps measured sizes and smooth drags; positions are committed on drag end.
  const [nodes, setNodes] = useState<CardNode[]>(built)
  useEffect(() => {
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]))
      return built.map((b) => {
        const o = old.get(b.id)
        return o ? { ...o, ...b, measured: o.measured } : b
      })
    })
  }, [built])

  const edges = useMemo<RoleFlowEdge[]>(
    () =>
      tree.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'role',
        selected: selection?.kind === 'edge' && selection.id === e.id,
        deletable: !readOnly && !ROLES[e.role].derived,
        data: { edge: e, dimmed: !!onPath && !(NUMERIC_ROLES.has(e.role) && onPath.has(e.source) && onPath.has(e.target)) },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onPath derives from scenario
    [tree.edges, selection, scenario, readOnly],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<CardNode>[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns))
      const removed: string[] = []
      for (const c of changes) {
        if (c.type === 'position' && c.position && c.dragging === false) moveNode(c.id, c.position)
        else if (c.type === 'remove') removed.push(c.id)
        else if (c.type === 'select' && c.selected) select({ kind: 'node', id: c.id })
      }
      if (removed.length) removeNodes(removed)
    },
    [moveNode, removeNodes, select],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<RoleFlowEdge>[]) => {
      const removed: string[] = []
      for (const c of changes) {
        if (c.type === 'remove') removed.push(c.id)
        else if (c.type === 'select' && c.selected) select({ kind: 'edge', id: c.id })
      }
      if (removed.length) removeEdges(removed)
    },
    [removeEdges, select],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return
      const s = tree.nodes.find((n) => n.id === c.source)
      const t = tree.nodes.find((n) => n.id === c.target)
      if (!s || !t) return
      if (tree.edges.some((e) => e.source === s.id && e.target === t.id)) return
      const numeric = kindOf(s) !== 'note' && kindOf(t) === 'metric'
      addEdge({ source: s.id, target: t.id, role: numeric ? 'driver' : 'influence' })
      if (kindOf(t) === 'formula')
        notify('info', `Added an influence link. To use ${s.label} in the maths, add [${s.label}] to ${t.label}'s formula.`)
    },
    [tree, addEdge, notify],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(DND_MIME)
      if (!raw) return
      e.preventDefault()
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addFromPayload(tree, JSON.parse(raw) as DragPayload, { x: pos.x - 118, y: pos.y - 40 })
    },
    [tree, screenToFlowPosition, addFromPayload],
  )

  return (
    <ReactFlow<CardNode, RoleFlowEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={readOnly ? undefined : onConnect}
      nodesConnectable={!readOnly}
      onPaneClick={() => select(null)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_MIME)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={readOnly ? undefined : onDrop}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.15}
      maxZoom={2}
      deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
      connectionRadius={28}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--line)" />
      <Controls showInteractive={false} position="bottom-right" />
      <MiniMap position="bottom-left" pannable zoomable style={{ width: 150, height: 100 }} nodeColor={(n) => ((n.data as CardData).kind === 'formula' ? 'var(--formula)' : 'var(--faint)')} />
      <Panel position="top-right">
        <Legend />
      </Panel>
      {tree.nodes.length === 0 && !readOnly && (
        <Panel position="top-center" className="!mt-24">
          <div className="max-w-sm rounded-2xl border border-dashed border-line bg-surface/90 p-6 text-center">
            <p className="font-semibold">Empty tree</p>
            <p className="mt-1 text-sm text-muted">
              Drag metrics from the library onto the canvas, or double-click one. Then connect a card&apos;s top dot to the bottom of the card it
              drives.
            </p>
          </div>
        </Panel>
      )}
    </ReactFlow>
  )
}

type CardData = CardNode['data']
