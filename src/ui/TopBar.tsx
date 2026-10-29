import { clsx } from 'clsx'
import { BrainCircuit, ChartLine, Coffee, FolderOpen, Moon, Network, TrendingUp } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useStore, type Workspace } from '../state/store'

/** The mark: a single path forking into two, drawn like a river delta. */
export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <path d="M14 25V15M14 15C14 10 8 9 6 4M14 15c0-5 6-6 8-11" fill="none" strokeWidth="2.6" strokeLinecap="round" className="stroke-frame-ink" />
        <circle cx="14" cy="25" r="2.6" className="fill-frame-ink" />
      </svg>
      <span className="font-display text-[19px] leading-none" translate="no">
        Treepath
      </span>
    </div>
  )
}

/** Two appearances: Black (the default) and Brown & Cream. */
function Appearance() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'dark')
  const choose = (next: 'light' | 'dark') => {
    document.documentElement.dataset.theme = next
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#000000' : '#3a2718')
    try {
      localStorage.setItem('treepath:theme', next)
    } catch {
      /* storage may be unavailable; the switch still works for this session */
    }
    setTheme(next)
  }
  return (
    <div role="radiogroup" aria-label="Appearance" className="flex rounded-full p-0.5 ring-1 ring-frame-ink/15">
      {(
        [
          ['dark', 'Black', Moon],
          ['light', 'Cream', Coffee],
        ] as const
      ).map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={theme === v}
          onClick={() => choose(v)}
          title={label === 'Cream' ? 'Brown & Cream appearance' : 'Black appearance'}
          className={clsx(
            'press flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium',
            theme === v ? 'bg-frame-ink text-frame' : 'text-frame-ink/60 hover:text-frame-ink',
          )}
        >
          <Icon className="size-3.5" />
          <span className="hidden md:inline">{label}</span>
        </button>
      ))}
    </div>
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
    <nav aria-label="Tools" className="relative flex rounded-full bg-frame-ink/[0.07] p-1 ring-1 ring-frame-ink/10">
      {pill && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-full bg-frame-ink"
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
              on ? 'text-frame' : 'text-frame-ink/60 hover:text-frame-ink',
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
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-frame px-5 text-frame-ink">
      <Logo />
      <div className="mx-auto">
        <Tabs />
      </div>
      <Appearance />
    </header>
  )
}
