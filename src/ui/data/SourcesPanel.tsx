import { clsx } from 'clsx'
import { Check, FileSpreadsheet, GripVertical, Link2, Plus, Sheet, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { ACCEPTED_EXTENSIONS } from '../../data/parse'
import type { Table } from '../../data/types'
import { useStore } from '../../state/store'
import { Button } from '../primitives'
import { nextSpot, TABLE_MIME } from './LinkCanvas'
import { useImport } from './useImport'

export function FilePicker({ children, variant = 'secondary' }: { children: React.ReactNode; variant?: 'primary' | 'secondary' }) {
  const input = useRef<HTMLInputElement>(null)
  const { importFiles } = useImport()
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(e) => {
          void importFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <Button variant={variant} onClick={() => input.current?.click()}>
        {children}
      </Button>
    </>
  )
}

export function SourcesPanel() {
  const tables = useStore((s) => s.tables)
  const links = useStore((s) => s.links)
  const selectedTableId = useStore((s) => s.selectedTableId)
  const dataView = useStore((s) => s.dataView)
  const layout = useStore((s) => s.linkLayout)
  const { selectTable, setDataView, clearAll, placeTable } = useStore.getState()
  const { loadSamples } = useImport()

  const byFile = useMemo(() => {
    const m = new Map<string, Table[]>()
    for (const t of tables) m.set(t.fileName, [...(m.get(t.fileName) ?? []), t])
    return [...m.entries()]
  }, [tables])

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-[13px] font-semibold text-ink">Sources</h2>
        <FilePicker>
          <Plus className="size-4" />
          Add Files
        </FilePicker>
      </div>

      {dataView === 'links' && <p className="mx-4 mb-1 rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs text-accent">Drag a file onto the canvas, or click it.</p>}
      <nav className="flex-1 overflow-y-auto overscroll-contain px-2 pb-2" aria-label="Imported tables">
        {byFile.map(([file, ts]) => (
          <div key={file} className="mt-2">
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-faint">
              <FileSpreadsheet className="size-3.5" />
              <span className="truncate">{file}</span>
            </div>
            {ts.map((t) => {
              const active = dataView === 'table' && t.id === selectedTableId
              const metrics = t.columns.filter((c) => c.role === 'metric').length
              return (
                <button
                  key={t.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TABLE_MIME, t.id)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => {
                    // On the links canvas a click adds the file; once it's there, a click opens its rows as usual.
                    if (dataView === 'links' && !layout[t.id]) placeTable(t.id, nextSpot(layout, links, t.id))
                    else selectTable(t.id)
                  }}
                  title={dataView === 'links' ? (layout[t.id] ? 'On the canvas. Click to see its rows' : 'Drag onto the canvas, or click to add it') : undefined}
                  className={clsx(
                    'group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                    dataView === 'links' && 'cursor-grab active:cursor-grabbing',
                    active ? 'bg-accent-soft text-ink' : 'text-ink hover:bg-surface-2',
                  )}
                >
                  <Sheet className={clsx('size-4 shrink-0', active ? 'text-accent' : 'text-faint')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{ts.length > 1 ? t.sheetName : t.name}</span>
                    <span className="block text-xs text-muted tabular">
                      {t.rows.length.toLocaleString()} rows, {metrics} metric{metrics === 1 ? '' : 's'}
                    </span>
                  </span>
                  {dataView === 'links' &&
                    (layout[t.id] ? <Check className="size-3.5 text-up" aria-label="On the canvas" /> : <GripVertical className="size-3.5 text-faint" />)}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-line p-2">
        <button
          type="button"
          onClick={() => setDataView('links')}
          className={clsx(
            'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium',
            dataView === 'links' ? 'bg-accent-soft' : 'hover:bg-surface-2',
          )}
        >
          <Link2 className={clsx('size-4', dataView === 'links' ? 'text-accent' : 'text-faint')} />
          <span className="flex-1">Table Links</span>
          <span className="rounded-md bg-surface-2 px-1.5 text-xs text-muted ring-1 ring-line tabular">{links.length}</span>
        </button>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => void loadSamples()} title="Re-import the bundled sample files">
          <Sparkles className="size-3.5" />
          Load Sample Data
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            if (confirm('Remove all imported tables and links from this browser?')) clearAll()
          }}
        >
          <Trash2 className="size-3.5" />
          Clear All Data
        </Button>
      </div>
    </aside>
  )
}
