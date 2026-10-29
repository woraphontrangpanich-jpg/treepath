import { ReactFlowProvider } from '@xyflow/react'
import { ChevronDown } from 'lucide-react'
import { useStore } from '../../state/store'
import { KeyCheck } from './KeyCheck'
import { LinkCanvas } from './LinkCanvas'

export function LinksView() {
  const tables = useStore((s) => s.tables)
  const links = useStore((s) => s.links)

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line bg-surface px-5 py-3">
        <h1 className="font-display text-[20px]">Table Links</h1>
        <p className="text-[13px] text-muted">
          Drag files onto the canvas, then drag from a column to the matching column in another file. Names can differ (
          <span className="font-mono text-ink">customer_id</span> ↔ <span className="font-mono text-ink">ID</span>).
        </p>
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
            Check that every row finds its key
          </summary>
          <div className="px-5 pb-5">
            <KeyCheck tables={tables} links={links} />
          </div>
        </details>
      )}
    </div>
  )
}
