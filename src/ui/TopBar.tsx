import { Database, FlaskConical, GitBranch, LineChart, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { useStore, type Workspace } from '../state/store'
import { Segmented } from './primitives'

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-accent" />
        <g strokeWidth="2.4" strokeLinecap="round" fill="none" className="stroke-accent-ink">
          <path d="M16 9v6M16 15l-6 7M16 15l6 7" />
        </g>
        <g className="fill-accent-ink">
          <circle cx="16" cy="8" r="3" />
          <circle cx="10" cy="23" r="2.6" />
          <circle cx="22" cy="23" r="2.6" />
        </g>
      </svg>
      <span className="text-[17px] font-semibold tracking-tight">treepath</span>
    </div>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light')
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('treepath:theme', next)
    } catch {
      /* storage may be unavailable; the toggle still works for this session */
    }
    setTheme(next)
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}

export function TopBar() {
  const workspace = useStore((s) => s.workspace)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const hasData = useStore((s) => s.tables.length > 0)

  const options: { value: Workspace; label: React.ReactNode; disabled?: boolean; title?: string }[] = [
    { value: 'data', label: <><Database className="size-3.5" />Data</> },
    { value: 'build', label: <><GitBranch className="size-3.5" />Build</>, disabled: !hasData, title: hasData ? undefined : 'Import data first' },
    { value: 'analyze', label: <><LineChart className="size-3.5" />Analyze</>, disabled: !hasData },
    { value: 'scenario', label: <><FlaskConical className="size-3.5" />Scenario</>, disabled: !hasData },
  ]

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-4">
      <Logo />
      <div className="mx-auto">
        <Segmented value={workspace} options={options} onChange={setWorkspace} />
      </div>
      <ThemeToggle />
    </header>
  )
}
