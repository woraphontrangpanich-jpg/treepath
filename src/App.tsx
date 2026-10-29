import { clsx } from 'clsx'
import { Loader2, X } from 'lucide-react'
import { useStore } from './state/store'
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
        <div className="toast pointer-events-auto flex items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm text-bg shadow-[0_12px_32px_-12px_rgb(23_35_56/0.35)]">
          <Loader2 className="size-4 animate-spin" />
          {busy}
        </div>
      )}
      {notices.map((n) => (
        <div
          key={n.id}
          data-leaving={n.leaving ? 'true' : undefined}
          className={clsx(
            'toast pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-[0_12px_32px_-12px_rgb(23_35_56/0.35)]',
            n.kind === 'error' ? 'bg-down text-white' : 'bg-ink text-bg',
          )}
        >
          <span className="flex-1">{n.text}</span>
          {n.action && (
            <button
              type="button"
              onClick={() => {
                n.action!.run()
                dismiss(n.id)
              }}
              className="press rounded-md px-2 py-0.5 font-semibold underline-offset-2 hover:underline"
            >
              {n.action.label}
            </button>
          )}
          <button type="button" onClick={() => dismiss(n.id)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
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
      ) : (
        <ScenarioWorkspace />
      )}
      <Notices />
    </div>
  )
}
