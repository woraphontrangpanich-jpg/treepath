import { clsx } from 'clsx'
import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'
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

const STEPS: { value: Workspace; label: string }[] = [
  { value: 'data', label: 'Files' },
  { value: 'build', label: 'Build' },
  { value: 'scenario', label: 'Forecast' },
]
const STEP_W = 128

/**
 * The three screens really are a sequence, so they read as a trail: stations joined by a line,
 * the travelled part drawn in teal, and a marker that slides to the current station.
 */
function StepTrail() {
  const workspace = useStore((s) => s.workspace)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const hasData = useStore((s) => s.tables.length > 0)
  const active = STEPS.findIndex((s) => s.value === workspace)

  return (
    <nav aria-label="Steps" className="relative" style={{ width: STEP_W * STEPS.length }}>
      {/* track, then the travelled part */}
      <div className="absolute top-[13px] h-0.5 rounded bg-line" style={{ left: STEP_W / 2, right: STEP_W / 2 }} />
      <div
        className="absolute top-[13px] h-0.5 origin-left rounded bg-accent"
        style={{
          left: STEP_W / 2,
          width: STEP_W * (STEPS.length - 1),
          transform: `scaleX(${active / (STEPS.length - 1)})`,
          transition: 'transform 300ms var(--ease-in-out)',
        }}
      />
      {/* sliding marker */}
      <div
        aria-hidden
        className="absolute top-[5px] size-[18px] rounded-full border-[3px] border-accent bg-surface"
        style={{ left: STEP_W / 2 - 9, transform: `translateX(${active * STEP_W}px)`, transition: 'transform 300ms var(--ease-in-out)' }}
      />
      <ol className="relative flex">
        {STEPS.map((s, i) => {
          const disabled = s.value !== 'data' && !hasData
          const done = i < active
          return (
            <li key={s.value} style={{ width: STEP_W }}>
              <button
                type="button"
                onClick={() => setWorkspace(s.value)}
                disabled={disabled}
                aria-current={i === active ? 'step' : undefined}
                title={disabled ? 'Import data first' : undefined}
                className="group flex w-full flex-col items-center gap-1 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span
                  className={clsx(
                    'mt-[9px] size-2.5 rounded-full transition-colors',
                    done ? 'bg-accent' : i === active ? 'bg-transparent' : 'bg-line group-hover:bg-faint',
                  )}
                />
                <span className={clsx('text-[13px] transition-colors', i === active ? 'font-semibold text-ink' : 'text-muted group-hover:text-ink')}>
                  <span className="text-faint tabular">{i + 1}</span> {s.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function TopBar() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line bg-surface px-5">
      <Logo />
      <div className="mx-auto">
        <StepTrail />
      </div>
      <ThemeToggle />
    </header>
  )
}
