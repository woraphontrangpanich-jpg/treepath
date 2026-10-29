import { useReactFlow } from '@xyflow/react'
import { Check, GripVertical, Search, Sigma, StickyNote } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useStore } from '../../state/store'
import type { Tree } from '../../tree/types'
import { DND_MIME, useAddFromPayload, type DragPayload } from './Canvas'

function DraggableItem({
  payload,
  onAdd,
  children,
  title,
}: {
  payload: DragPayload
  onAdd: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <div
      draggable
      title={title ?? 'Drag onto the canvas, or double-click to add'}
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, JSON.stringify(payload))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onDoubleClick={onAdd}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onAdd()
      }}
      tabIndex={0}
      role="button"
      className="group flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2 active:cursor-grabbing"
    >
      <GripVertical className="size-3.5 shrink-0 text-faint opacity-0 group-hover:opacity-100" />
      {children}
    </div>
  )
}

export function Library({ tree }: { tree: Tree }) {
  const tables = useStore((s) => s.tables)
  const [q, setQ] = useState('')
  const addFromPayload = useAddFromPayload()
  const { screenToFlowPosition } = useReactFlow()

  const addAtCenter = (p: DragPayload) => {
    const el = document.querySelector('.react-flow')?.getBoundingClientRect()
    const c = el ? screenToFlowPosition({ x: el.left + el.width / 2, y: el.top + el.height / 2 }) : { x: 0, y: 0 }
    // Nudge so repeated double-clicks don't stack exactly.
    const jitter = (tree.nodes.length % 5) * 24
    addFromPayload(tree, p, { x: c.x - 118 + jitter, y: c.y - 60 + jitter })
  }

  const used = useMemo(() => new Set(tree.nodes.filter((n) => n.metric).map((n) => `${n.metric!.fileName}|${n.metric!.sheetName}|${n.metric!.column}`)), [tree.nodes])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    // Tables without a date column are lookups (e.g. a regions list): usable as filters, not as time series.
    return tables
      .filter((t) => t.columns.some((c) => c.role === 'date'))
      .map((t) => ({
        table: t,
        metrics: t.columns.filter(
          (c) => c.role === 'metric' && (!needle || c.name.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle)),
        ),
      }))
      .filter((g) => g.metrics.length > 0)
  }, [tables, q])

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface">
      <div className="space-y-2 p-3">
        <div className="text-[11px] font-semibold tracking-wider text-muted uppercase">Add cards</div>
        <div className="grid grid-cols-2 gap-2">
          <DraggableItem payload={{ kind: 'formula' }} onAdd={() => addAtCenter({ kind: 'formula' })}>
            <span className="-ml-4 flex items-center gap-1.5 font-medium text-formula">
              <Sigma className="size-4" />
              Formula
            </span>
          </DraggableItem>
          <DraggableItem payload={{ kind: 'note' }} onAdd={() => addAtCenter({ kind: 'note' })}>
            <span className="-ml-4 flex items-center gap-1.5 font-medium text-muted">
              <StickyNote className="size-4" />
              Note
            </span>
          </DraggableItem>
        </div>
      </div>

      <div className="border-t border-line px-3 pt-3">
        <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">Metric library</div>
        <label className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2 text-sm focus-within:border-accent">
          <Search className="size-3.5 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search metrics" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        {groups.map(({ table, metrics }) => (
          <div key={table.id} className="mb-2">
            <div className="truncate px-2 py-1 text-xs text-faint">{table.name}</div>
            {metrics.map((c) => {
              const isUsed = used.has(`${table.fileName}|${table.sheetName}|${c.name}`)
              const payload: DragPayload = { kind: 'metric', tableId: table.id, column: c.name }
              return (
                <DraggableItem key={c.name} payload={payload} onAdd={() => addAtCenter(payload)}>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {isUsed ? <Check className="size-3.5 text-accent" aria-label="On canvas" /> : <span className="text-[10px] text-faint">{c.aggregation}</span>}
                </DraggableItem>
              )
            })}
          </div>
        ))}
        {groups.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">No metrics match.</p>}
      </div>
      <p className="border-t border-line px-3 py-2 text-[11px] leading-4 text-faint">Drag onto the canvas or double-click. Columns marked as Metric in Data appear here.</p>
    </aside>
  )
}
