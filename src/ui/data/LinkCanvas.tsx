import {
  applyNodeChanges,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  Panel,
  Position,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import { clsx } from 'clsx'
import { Calendar, ChevronRight, FileSpreadsheet, Hash, KeyRound, LayoutDashboard, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { hasLink, linkStats, orientLink, suggestLinks, type LinkStats } from '../../data/links'
import type { Column, ColumnRef, Link, Table } from '../../data/types'
import { useStore } from '../../state/store'
import { Button } from '../primitives'

const NODE_W = 260
const GAP_X = 170

const ROW_H = 200

/**
 * Lay every file out: lookup lists (files that are only ever linked *to*) in the middle column,
 * the other files alternating left and right of them, so every link is short and nothing overlaps.
 */
export function layoutFiles(tables: Table[], links: Link[]): Record<string, { x: number; y: number }> {
  const isLookup = (id: string) => links.some((l) => l.to.tableId === id) && !links.some((l) => l.from.tableId === id)
  const lookups = tables.filter((t) => isLookup(t.id))
  // Linked data files first, so they sit nearest the top beside the lookups.
  const others = tables
    .filter((t) => !isLookup(t.id))
    .sort((a, b) => Number(links.some((l) => l.from.tableId === b.id)) - Number(links.some((l) => l.from.tableId === a.id)))
  const out: Record<string, { x: number; y: number }> = {}
  const step = NODE_W + GAP_X
  if (lookups.length === 0) {
    others.forEach((t, i) => (out[t.id] = { x: (i % 3) * step, y: Math.floor(i / 3) * ROW_H }))
    return out
  }
  const sideRows = Math.ceil(others.length / 2)
  const top = Math.max(0, ((sideRows - lookups.length) * ROW_H) / 2)
  lookups.forEach((t, i) => (out[t.id] = { x: step, y: top + i * ROW_H }))
  others.forEach((t, i) => (out[t.id] = { x: i % 2 === 0 ? 0 : 2 * step, y: Math.floor(i / 2) * ROW_H }))
  return out
}

/** Columns you'd join on: IDs and categories. Dates and numbers are summarised instead. */
const linkable = (c: Column) => c.role === 'key' || c.role === 'dimension'

type PickFn = (ref: ColumnRef) => void
type TableData = {
  table: Table
  pending: ColumnRef | null
  /** Column → number of links touching it. */
  linkCount: Map<string, number>
  onPick: PickFn
  onOpen: (id: string) => void
}
type TableNode = Node<TableData, 'table'>

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monthLabel(v: unknown) {
  const m = /^(\d{4})-(\d{2})/.exec(String(v))
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(v)
}

function sample(c: Column) {
  return c.profile.samples
    .slice(0, 3)
    .map((v) => String(v))
    .join(', ')
}

function ColumnRow({ table, col, data, faint }: { table: Table; col: Column; data: TableData; faint?: boolean }) {
  const isPending = data.pending?.tableId === table.id && data.pending.column === col.name
  const canTarget = !!data.pending && data.pending.tableId !== table.id
  const links = data.linkCount.get(col.name) ?? 0
  const Icon = col.role === 'date' ? Calendar : col.role === 'metric' ? Hash : KeyRound
  const pick = () => data.onPick({ tableId: table.id, column: col.name })
  return (
    <div
      className={clsx(
        'relative flex items-center gap-2 px-3 py-1.5 text-[12.5px] transition-colors',
        isPending ? 'bg-accent text-accent-ink' : canTarget ? 'hover:bg-accent-soft' : 'hover:bg-surface-2',
        faint && !isPending && 'text-muted',
      )}
    >
      <Icon className={clsx('size-3.5 shrink-0', isPending ? 'text-accent-ink' : col.role === 'key' ? 'text-accent' : 'text-faint')} />
      <span className="min-w-0 flex-1 truncate font-medium">{col.name}</span>
      <span className={clsx('max-w-[96px] truncate text-[11px]', isPending ? 'text-accent-ink/80' : 'text-faint')}>{sample(col)}</span>
      {links > 0 && <span className={clsx('size-1.5 shrink-0 rounded-full', isPending ? 'bg-accent-ink' : 'bg-accent')} aria-label={`${links} link(s)`} />}
      {/* The whole row starts a link: drag it to another file's column, or click it and then the other column. */}
      <Handle
        type="source"
        position={Position.Right}
        id={`${col.name}|row`}
        role="button"
        tabIndex={0}
        aria-label={`Link ${col.name}`}
        title={`${col.name}: ${col.profile.distinct.toLocaleString()} distinct values, e.g. ${sample(col)}. Drag to the matching column, or click.`}
        onClick={(e) => {
          e.stopPropagation()
          pick()
        }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick())}
        className="!top-0 !left-0 !h-full !w-full !transform-none !cursor-crosshair !rounded-none !border-0 !bg-transparent"
      />
      {/* Visible anchors that links attach to. */}
      <Handle type="source" position={Position.Left} id={`${col.name}|l`} className="!size-3 !border-2 !border-surface !bg-accent" />
      <Handle type="source" position={Position.Right} id={`${col.name}|r`} className="!size-3 !border-2 !border-surface !bg-accent" />
    </div>
  )
}

function TableCardImpl({ data, selected }: NodeProps<TableNode>) {
  const { table } = data
  const [showAll, setShowAll] = useState(false)
  const keys = table.columns.filter(linkable)
  const rest = table.columns.filter((c) => !linkable(c) && c.role !== 'ignore')
  const date = table.columns.find((c) => c.role === 'date')
  const span = date && date.profile.min !== null ? `, ${monthLabel(date.profile.min)} to ${monthLabel(date.profile.max)}` : ''
  return (
    <div
      className={clsx('rounded-xl border bg-surface shadow-[0_8px_24px_-16px_rgb(17_42_51/0.5)]', selected ? 'border-accent' : 'border-line')}
      style={{ width: NODE_W }}
    >
      <button
        type="button"
        onClick={() => data.onOpen(table.id)}
        title="See this file's data and settings"
        className="nodrag group flex w-full items-center gap-2.5 rounded-t-xl border-b border-line bg-surface-2 px-3 py-2.5 text-left hover:bg-accent-soft"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-ink">
          <FileSpreadsheet className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold">{table.name}</span>
          <span className="block truncate text-[11px] text-muted tabular">
            {table.rows.length.toLocaleString()} rows{span}
          </span>
        </span>
        <span className="flex items-center gap-0.5 text-[11.5px] font-medium text-accent opacity-70 group-hover:opacity-100">
          Open <ChevronRight className="size-3.5" />
        </span>
      </button>
      {keys.length === 0 && !showAll && <p className="px-3 py-2 text-[11.5px] text-muted">No ID columns to connect.</p>}
      {keys.map((c) => (
        <ColumnRow key={c.name} table={table} col={c} data={data} />
      ))}
      {showAll && rest.map((c) => <ColumnRow key={c.name} table={table} col={c} data={data} faint />)}
      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="nodrag block w-full truncate rounded-b-xl border-t border-line px-3 py-1.5 text-left text-[11px] text-muted hover:bg-surface-2 hover:text-ink"
        >
          {showAll ? 'Show fewer columns' : `Also has ${rest.map((c) => c.name).join(', ')}`}
        </button>
      )}
    </div>
  )
}
const TableCard = memo(TableCardImpl)

type LinkEdgeData = { stats: LinkStats | null; suggested?: { from: ColumnRef; to: ColumnRef }; onSelect?: () => void }
type LinkFlowEdge = Edge<LinkEdgeData, 'link'>

function matchTone(stats: LinkStats | null) {
  const pct = stats ? stats.matchRate : 0
  return pct >= 0.95 ? 'up' : pct >= 0.6 ? 'warn' : 'down'
}

function LinkEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<LinkFlowEdge>) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const addLink = useStore((s) => s.addLink)
  const tone = matchTone(data!.stats)
  const pct = Math.round((data!.stats?.matchRate ?? 0) * 100)
  if (data!.suggested) {
    const s = data!.suggested
    return (
      <>
        <BaseEdge id={id} path={path} style={{ stroke: 'var(--faint)', strokeWidth: 1.5, strokeDasharray: '5 5' }} />
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={() => addLink({ from: s.from, to: s.to })}
            className="nodrag nopan press pointer-events-auto absolute flex items-center gap-1 rounded-full border border-dashed border-accent bg-surface px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent-soft"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            <Plus className="size-3" /> Link ({pct}% match)
          </button>
        </EdgeLabelRenderer>
      </>
    )
  }
  return (
    <>
      <BaseEdge id={id} path={path} interactionWidth={18} style={{ stroke: `var(--${tone === 'up' ? 'accent' : tone})`, strokeWidth: selected ? 3.25 : 2.25 }} />
      <EdgeLabelRenderer>
        <button
          type="button"
          onClick={data!.onSelect}
          className={clsx(
            'nodrag nopan pointer-events-auto absolute rounded-full border bg-surface px-2 py-px text-[11px] font-semibold tabular hover:border-ink/50',
            selected ? 'border-ink/50' : 'border-line',
            tone === 'up' ? 'text-up' : tone === 'warn' ? 'text-warn' : 'text-down',
          )}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
        >
          {pct}% match
        </button>
      </EdgeLabelRenderer>
    </>
  )
}
const LinkEdge = memo(LinkEdgeImpl)

const nodeTypes = { table: TableCard }
const edgeTypes = { link: LinkEdge }
const colOf = (handle: string | null | undefined) => (handle ?? '').replace(/\|(l|r|row)$/, '')

/** Pick the facing sides so a link never loops around its own card. */
function sides(layout: Record<string, { x: number }>, a: string, b: string) {
  return (layout[a]?.x ?? 0) <= (layout[b]?.x ?? 0) ? (['r', 'l'] as const) : (['l', 'r'] as const)
}

const CARDINALITY: Record<LinkStats['cardinality'], (a: string, b: string) => string> = {
  'many-to-one': (a, b) => `Many rows in ${a} point to one row in ${b}. This is the usual lookup link.`,
  'one-to-one': (a, b) => `Each row in ${a} matches exactly one row in ${b}.`,
  'one-to-many': (a, b) => `One row in ${a} matches many rows in ${b}.`,
  'many-to-many': (a, b) => `Values repeat in both ${a} and ${b}. Rows will still match by value, but neither file is a lookup list.`,
}

function LinkDetails({ link, tables, onClose }: { link: Link; tables: Table[]; onClose: () => void }) {
  const removeLink = useStore((s) => s.removeLink)
  const stats = useMemo(() => linkStats(tables, link), [tables, link])
  const name = (r: ColumnRef) => tables.find((t) => t.id === r.tableId)?.name ?? '?'
  const tone = matchTone(stats)
  return (
    <div className="popover w-80 rounded-xl border border-line bg-surface p-4 shadow-[0_18px_40px_-22px_rgb(17_42_51/0.55)]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate">
            <span className="text-muted">{name(link.from)} ›</span> <span className="font-semibold">{link.from.column}</span>
          </div>
          <div className="truncate">
            <span className="text-muted">{name(link.to)} ›</span> <span className="font-semibold">{link.to.column}</span>
          </div>
        </div>
        <button type="button" onClick={onClose} className="press grid size-6 place-items-center rounded-full text-faint hover:bg-surface-2" aria-label="Close">
          <X className="size-3.5" />
        </button>
      </div>
      {stats ? (
        <>
          <p className={clsx('mt-3 font-display text-[22px] leading-none', tone === 'up' ? 'text-up' : tone === 'warn' ? 'text-warn' : 'text-down')}>
            {Math.round(stats.matchRate * 100)}% match
          </p>
          <p className="mt-1 text-xs text-muted tabular">
            {stats.matched.toLocaleString()} of {stats.fromDistinct.toLocaleString()} values in {link.from.column} are found in {link.to.column}.
          </p>
          <p className="mt-2 text-xs text-muted">
            {stats.matched === 0
              ? 'Nothing matches, so this link does nothing. These columns probably hold different kinds of values.'
              : CARDINALITY[stats.cardinality](name(link.from), name(link.to))}
          </p>
          {stats.unmatchedSamples.length > 0 && (
            <p className="mt-2 text-xs text-warn">
              Not found:{' '}
              {stats.unmatchedSamples.map((v) => (
                <span key={String(v)} className="mr-1 font-mono">
                  {String(v)}
                </span>
              ))}
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-down">This link points at a column that no longer exists.</p>
      )}
      <Button
        variant="danger"
        size="sm"
        className="mt-3"
        onClick={() => {
          removeLink(link.id)
          onClose()
        }}
      >
        <Trash2 className="size-3.5" /> Remove link
      </Button>
    </div>
  )
}

export function LinkCanvas() {
  const tables = useStore((s) => s.tables)
  const links = useStore((s) => s.links)
  const layout = useStore((s) => s.linkLayout)
  const { placeTable, addLink, notify } = useStore.getState()
  const { fitView } = useReactFlow()
  const [pending, setPending] = useState<ColumnRef | null>(null)
  const [selectedLink, setSelectedLink] = useState<string | null>(null)

  // Every file is on the canvas. When new files arrive, lay them all out again so they fit together.
  useEffect(() => {
    if (tables.some((t) => !layout[t.id])) useStore.setState({ linkLayout: layoutFiles(tables, links) })
  }, [links, tables, layout])

  const connect = useCallback(
    (a: ColumnRef, b: ColumnRef) => {
      if (a.tableId === b.tableId) return notify('info', 'Link columns from two different files.')
      if (hasLink(useStore.getState().links, a, b)) return notify('info', 'Those columns are already linked.')
      const l = orientLink(tables, a, b)
      const stats = linkStats(tables, l)
      const id = addLink(l)
      if (stats && stats.matched === 0)
        notify('error', `No values in “${l.from.column}” appear in “${l.to.column}”. Check these are the same kind of ID.`, {
          label: 'Undo',
          run: () => useStore.getState().removeLink(id),
        })
    },
    [tables, addLink, notify],
  )

  const onPick = useCallback<PickFn>(
    (ref) => {
      setSelectedLink(null)
      setPending((p) => {
        if (!p || p.tableId === ref.tableId) return p?.tableId === ref.tableId && p.column === ref.column ? null : ref
        connect(p, ref)
        return null
      })
    },
    [connect],
  )

  const onOpen = useCallback((id: string) => useStore.getState().selectTable(id), [])

  const onCanvas = useMemo(() => tables.filter((t) => layout[t.id]), [tables, layout])
  // Re-frame whenever a file joins (dragged, clicked in the list, or placed for a new link).
  const count = onCanvas.length
  const measured = useNodesInitialized()
  useEffect(() => {
    if (count && measured) void fitView({ padding: 0.2, maxZoom: 1, duration: 300 })
  }, [count, measured, fitView])
  const built = useMemo<TableNode[]>(
    () =>
      onCanvas.map((t) => {
        const linkCount = new Map<string, number>()
        for (const l of links)
          for (const r of [l.from, l.to]) if (r.tableId === t.id) linkCount.set(r.column, (linkCount.get(r.column) ?? 0) + 1)
        return { id: t.id, type: 'table', position: layout[t.id], data: { table: t, pending, linkCount, onPick, onOpen } }
      }),
    [onCanvas, links, layout, pending, onPick, onOpen],
  )
  const [nodes, setNodes] = useState<TableNode[]>(built)
  useEffect(() => {
    setNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]))
      return built.map((b) => ({ ...b, measured: old.get(b.id)?.measured, selected: old.get(b.id)?.selected }))
    })
  }, [built])

  const suggestions = useMemo(() => suggestLinks(tables, links), [tables, links])
  const edges = useMemo<LinkFlowEdge[]>(() => {
    const out: LinkFlowEdge[] = links
      .filter((l) => layout[l.from.tableId] && layout[l.to.tableId])
      .map((l) => {
        const [sa, sb] = sides(layout, l.from.tableId, l.to.tableId)
        return {
          id: l.id,
          type: 'link',
          source: l.from.tableId,
          target: l.to.tableId,
          sourceHandle: `${l.from.column}|${sa}`,
          targetHandle: `${l.to.column}|${sb}`,
          selected: l.id === selectedLink,
          data: { stats: linkStats(tables, l), onSelect: () => setSelectedLink(l.id) },
        }
      })
    suggestions.forEach((s, i) => {
      if (!layout[s.from.tableId] || !layout[s.to.tableId]) return
      const [sa, sb] = sides(layout, s.from.tableId, s.to.tableId)
      out.push({
        id: `suggest-${i}`,
        type: 'link',
        source: s.from.tableId,
        target: s.to.tableId,
        sourceHandle: `${s.from.column}|${sa}`,
        targetHandle: `${s.to.column}|${sb}`,
        selectable: false,
        data: { stats: s.stats, suggested: { from: s.from, to: s.to } },
      })
    })
    return out
  }, [links, layout, tables, suggestions, selectedLink])

  const onNodesChange = useCallback(
    (changes: NodeChange<TableNode>[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns))
      for (const c of changes) if (c.type === 'position' && c.position && c.dragging === false) placeTable(c.id, c.position)
    },
    [placeTable],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return
      connect({ tableId: c.source, column: colOf(c.sourceHandle) }, { tableId: c.target, column: colOf(c.targetHandle) })
    },
    [connect],
  )

  // Lay every file out again from scratch: lookups in the middle, data files around them.
  const tidy = () => {
    useStore.setState({ linkLayout: layoutFiles(tables, links) })
    setTimeout(() => void fitView({ padding: 0.2, maxZoom: 1, duration: 300 }), 120)
  }

  const link = links.find((l) => l.id === selectedLink)

  return (
    <ReactFlow<TableNode, LinkFlowEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      connectionMode={ConnectionMode.Loose}
      onNodesChange={onNodesChange}
      onConnect={onConnect}
      onEdgeClick={(_, e) => !e.id.startsWith('suggest-') && setSelectedLink(e.id)}
      onPaneClick={() => {
        setPending(null)
        setSelectedLink(null)
      }}
      onEdgesDelete={(es) => es.forEach((e) => useStore.getState().removeLink(e.id))}
      onKeyDown={(e) => e.key === 'Escape' && setPending(null)}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.3}
      maxZoom={1.6}
      connectionRadius={24}
      connectOnClick={false}
      deleteKeyCode={['Backspace', 'Delete']}
    >
      <Controls showInteractive={false} position="bottom-right" />
      {onCanvas.length > 1 && (
        <Panel position="top-left">
          <Button size="sm" onClick={tidy}>
            <LayoutDashboard className="size-3.5" /> Tidy Up
          </Button>
        </Panel>
      )}
      {pending && (
        <Panel position="top-center">
          <div className="toast flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] text-bg shadow-lg">
            Now click the matching column in another file
            <button type="button" onClick={() => setPending(null)} className="ml-1 rounded-full px-2 text-bg/70 hover:bg-bg/15 hover:text-bg">
              Cancel
            </button>
          </div>
        </Panel>
      )}
      {link && (
        <Panel position="top-right">
          <LinkDetails link={link} tables={tables} onClose={() => setSelectedLink(null)} />
        </Panel>
      )}
      {!link && suggestions.length > 0 && (
        <Panel position="top-right">
          <button
            type="button"
            onClick={() => suggestions.forEach((x) => addLink({ from: x.from, to: x.to }))}
            className="press flex items-center gap-1.5 rounded-full bg-pop px-3.5 py-1.5 text-[12.5px] font-semibold text-pop-ink shadow-sm hover:brightness-105"
          >
            <Sparkles className="size-3.5" /> Connect {suggestions.length} matching column{suggestions.length === 1 ? '' : 's'} for me
          </button>
        </Panel>
      )}
      {!pending && links.length === 0 && onCanvas.length > 1 && (
        <Panel position="bottom-center">
          <p className="max-w-md rounded-full bg-ink px-4 py-2 text-center text-[12.5px] text-bg shadow-lg">
            To connect two files, drag from a column in one to the column with the same IDs in the other.
          </p>
        </Panel>
      )}
    </ReactFlow>
  )
}
