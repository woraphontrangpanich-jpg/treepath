import { clsx } from 'clsx'
import { BrainCircuit, ChartLine, FolderOpen, Moon, Network, Sun, TrendingUp } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useStore, type Workspace } from '../state/store'

/** The mark: a single path forking into two, drawn like a river delta. */
export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <path d="M14 25V15M14 15C14 10 8 9 6 4M14 15c0-5 6-6 8-11" fill="none" strokeWidth="2.6" strokeLinecap="round" className="stroke-accent" />
        <circle cx="14" cy="25" r="2.6" className="fill-ink" />
      </svg>
      <span className="font-display text-[19px] leading-none" translate="no">
        Treepath
      </span>
    </div>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'light')
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0b1a20' : '#eef5f4')
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
      className="press grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}

const TABS: { value: Workspace; label: string; icon: typeof FolderOpen }[] = [
  { value: 'data', label: 'Files', icon: FolderOpen },
  { value: 'build', label: 'Tree', icon: Network },
  { value: 'scenario', label: 'Forecast', icon: TrendingUp },
  { value: 'charts', label: 'Charts', icon: ChartLine },
  { value: 'ml', label: 'Machine Learning', icon: BrainCircuit },
]

/** Five tools, used in any order; a pill slides under the open one. */
function Tabs() {
  const workspace = useStore((s) => s.workspace)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const hasData = useStore((s) => s.tables.length > 0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  const active = TABS.findIndex((t) => t.value === workspace)
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[active]
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [active])

  return (
    <nav aria-label="Tools" className="relative flex rounded-full bg-surface-2 p-1 ring-1 ring-line">
      {pill && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-full bg-ink shadow-sm"
          style={{ left: pill.left, width: pill.width, transition: 'left 280ms var(--ease-in-out), width 280ms var(--ease-in-out)' }}
        />
      )}
      {TABS.map((t, i) => {
        const disabled = t.value !== 'data' && !hasData
        const on = i === active
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            onClick={() => setWorkspace(t.value)}
            disabled={disabled}
            aria-current={on ? 'page' : undefined}
            title={disabled ? 'Add files first' : t.label}
            className={clsx(
              'relative flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40',
              on ? 'text-bg' : 'text-muted hover:text-ink',
            )}
          >
            <t.icon className="size-4 shrink-0" />
            <span className={clsx(on ? 'inline' : 'hidden lg:inline')}>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export function TopBar() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-surface px-5">
      <Logo />
      <div className="mx-auto">
        <Tabs />
      </div>
      <ThemeToggle />
    </header>
  )
}
