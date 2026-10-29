import { ReactFlowProvider } from '@xyflow/react'
import { ChevronDown, Plus, Sparkles, Trash2 } from 'lucide-react'
import { plural } from '../../lib/format'
import { useStore } from '../../state/store'
import { Button } from '../primitives'
import { FilePicker } from './FilePicker'
import { KeyCheck } from './KeyCheck'
import { LinkCanvas } from './LinkCanvas'
import { useImport } from './useImport'

/** The Files home: every file as a card, connected by the columns they share. */
export function LinksView() {
  const tables = useStore((s) => s.tables)
  const links = useStore((s) => s.links)
  const clearAll = useStore((s) => s.clearAll)
  const { loadSamples } = useImport()

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line bg-surface px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[21px] leading-tight">Your files</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {plural(tables.length, 'file')}, {plural(links.length, 'connection')}. Click a file to see its data. Drag between columns to connect files.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm('Remove all files and connections from this browser?')) clearAll()
            }}
          >
            <Trash2 className="size-3.5" />
            Remove all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void loadSamples()} title="Add the sample files again">
            <Sparkles className="size-3.5" />
            Sample files
          </Button>
          <FilePicker variant="primary">
            <Plus className="size-4" />
            Add files
          </FilePicker>
        </div>
      </header>
      <div className="contour relative min-h-0 flex-1">
        <ReactFlowProvider>
          <LinkCanvas />
        </ReactFlowProvider>
      </div>
      {links.length > 0 && (
        <details className="group max-h-[45%] shrink-0 overflow-y-auto border-t border-line bg-surface">
          <summary className="sticky top-0 flex cursor-pointer list-none items-center gap-2 bg-surface px-5 py-2.5 text-sm font-medium hover:bg-surface-2">
            <ChevronDown className="size-4 -rotate-90 text-faint transition-transform group-open:rotate-0" />
            Check the connections
            <span className="font-normal text-muted">: does every row find its match?</span>
          </summary>
          <div className="px-5 pb-5">
            <KeyCheck tables={tables} links={links} />
          </div>
        </details>
      )}
    </div>
  )
}
