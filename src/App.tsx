import { clsx } from 'clsx'
import { FlaskConical, GitBranch, LineChart, Loader2, X } from 'lucide-react'
import { useStore, type Workspace } from './state/store'
import { DataWorkspace } from './ui/data/DataWorkspace'
import { TopBar } from './ui/TopBar'

const UPCOMING: Record<Exclude<Workspace, 'data'>, { icon: typeof GitBranch; title: string; text: string }> = {
  build: {
    icon: GitBranch,
    title: 'Build — coming next',
    text: 'Drag metrics onto a canvas, add formula cards (Revenue = Orders × Price), and connect drivers with typed links.',
  },
  analyze: {
    icon: LineChart,
    title: 'Analyze — coming soon',
    text: 'Trends, correlations and fitted regression models for every driver link, with diagnostics.',
  },
  scenario: {
    icon: FlaskConical,
    title: 'Scenario — coming soon',
    text: 'Change an input ("increase Ad Spend 20%") and follow the impact through the tree to your outcome, with a confidence range.',
  },
}

function Upcoming({ workspace }: { workspace: Exclude<Workspace, 'data'> }) {
  const u = UPCOMING[workspace]
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <u.icon className="size-6" />
        </span>
        <h2 className="mt-4 text-xl font-semibold">{u.title}</h2>
        <p className="mt-2 text-sm text-muted">{u.text}</p>
      </div>
    </div>
  )
}

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
      ) : (
        <Upcoming workspace={workspace} />
      )}
      <Notices />
    </div>
  )
}
