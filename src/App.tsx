import { clsx } from 'clsx'
import { Loader2, X } from 'lucide-react'
import { useStore } from './state/store'
import { AnalyzeWorkspace } from './ui/analyze/AnalyzeWorkspace'
import { BuildWorkspace } from './ui/build/BuildWorkspace'
import { DataWorkspace } from './ui/data/DataWorkspace'
import { ScenarioWorkspace } from './ui/scenario/ScenarioWorkspace'
import { TopBar } from './ui/TopBar'

function Notices() {
  const notices = useStore((s) => s.notices)
  const busy = useStore((s) => s.busy)
  const dismiss = useStore((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {busy && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-lg">
          <Loader2 className="size-4 animate-spin text-accent" />
          {busy}
        </div>
      )}
      {notices.map((n) => (
        <div
          key={n.id}
          className={clsx(
            'pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg',
            n.kind === 'error' ? 'border-down/30 bg-down-soft' : 'border-line bg-surface',
          )}
        >
          <span className="flex-1">{n.text}</span>
          <button type="button" onClick={() => dismiss(n.id)} className="text-faint hover:text-ink" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const hydrated = useStore((s) => s.hydrated)
  const workspace = useStore((s) => s.workspace)
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      {!hydrated ? (
        <div className="grid flex-1 place-items-center text-muted">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : workspace === 'data' ? (
        <DataWorkspace />
      ) : workspace === 'build' ? (
        <BuildWorkspace />
      ) : workspace === 'analyze' ? (
        <AnalyzeWorkspace />
      ) : (
        <ScenarioWorkspace />
      )}
      <Notices />
    </div>
  )
}
