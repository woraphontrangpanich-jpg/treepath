import { clsx } from 'clsx'
import { FileSpreadsheet, Lock, Network, SlidersHorizontal, Sparkles, Upload } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { useStore } from '../../state/store'
import { Button } from '../primitives'
import { LinksView } from './LinksView'
import { FilePicker } from './FilePicker'
import { TableView } from './TableView'
import { useImport } from './useImport'

/** Lets users drop files anywhere on the Files workspace. */
function DropZone({ children }: { children: React.ReactNode }) {
  const [over, setOver] = useState(false)
  const { importFiles } = useImport()
  return (
    <div
      className="relative flex min-h-0 flex-1"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void importFiles(Array.from(e.dataTransfer.files))
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-accent">
            <Upload className="size-8" />
            <span className="text-lg font-semibold">Drop Excel or CSV files to add them</span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The welcome demo: a small Net Revenue tree you can play with. Moving Ad Spend lifts Orders (a learned
 * effect, elasticity 0.35), Orders lift Revenue, and the extra ad cost pulls Net Revenue back down.
 */
function demo(pct: number) {
  const x = pct / 100
  const ad = 10_500 * (1 + x)
  const orders = 7_402 * Math.pow(1 + x, 0.35)
  const revenue = orders * 12.25
  const net = revenue - orders * 4.51 - ad
  return { ad, orders, revenue, net }
}
type DemoKey = keyof ReturnType<typeof demo>
const BASE = demo(0)

function short(v: number) {
  return v >= 10_000 ? `${(v / 1000).toFixed(1)}K` : Math.round(v).toLocaleString()
}
function pctText(v: number) {
  const r = Math.round(v * 10) / 10
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)}%`
}

function DemoTree({ pct }: { pct: number }) {
  const now = demo(pct)
  const change = (k: DemoKey) => ((now[k] - BASE[k]) / BASE[k]) * 100
  const tone = (d: number) => (Math.abs(d) < 0.05 ? 'idle' : d > 0 ? 'up' : 'down')

  const node = (x: number, y: number, w: number, label: string, k: DemoKey, outcome = false) => {
    const d = change(k)
    const t = tone(d)
    return (
      <g transform={`translate(${x} ${y})`}>
        <rect width={w} height="64" rx={outcome ? 18 : 12} className={outcome ? 'fill-ink' : 'fill-surface stroke-line'} strokeWidth="1" />
        <text x="16" y="24" className={outcome ? 'fill-bg' : 'fill-muted'} style={{ fontSize: 12.5, fontWeight: 600 }}>
          {label}
        </text>
        <text x="16" y="50" className={outcome ? 'fill-bg' : 'fill-ink'} style={{ fontSize: outcome ? 23 : 20, fontWeight: 600, fontStretch: '125%' }}>
          {short(now[k])}
        </text>
        <g style={{ opacity: t === 'idle' ? 0 : 1, transition: 'opacity 200ms var(--ease-out)' }}>
          <rect x={w - 72} y="34" width="58" height="21" rx="10.5" className={t === 'down' ? 'fill-down' : 'fill-up'} />
          <text x={w - 43} y="49" textAnchor="middle" className="fill-white" style={{ fontSize: 11.5, fontWeight: 700 }}>
            {pctText(d)}
          </text>
        </g>
      </g>
    )
  }

  const edge = (d: string, k: DemoKey, invert = false) => {
    const t = tone(invert ? -change(k) : change(k))
    return (
      <path
        d={d}
        fill="none"
        strokeLinecap="round"
        strokeWidth={t === 'idle' ? 1.75 : 3}
        className={t === 'idle' ? 'stroke-line' : t === 'up' ? 'stroke-up' : 'stroke-down'}
        style={{ transition: 'stroke 200ms, stroke-width 200ms' }}
      />
    )
  }

  return (
    <svg viewBox="0 0 470 390" className="w-full" role="img" aria-label={`Ad Spend ${pctText(pct)} changes Net Revenue by ${pctText(change('net'))}`}>
      {edge('M330 306 C 330 270, 115 300, 115 266', 'orders')}
      {edge('M115 202 L 115 162', 'revenue')}
      {edge('M210 130 C 300 130, 330 120, 330 82', 'revenue')}
      {edge('M410 306 C 450 230, 440 150, 410 82', 'ad', true)}
      <text x="452" y="200" textAnchor="end" className="fill-faint" style={{ fontSize: 11 }}>
        ad cost
      </text>
      {node(250, 18, 200, 'Net Revenue', 'net', true)}
      {node(20, 98, 190, 'Revenue', 'revenue')}
      {node(20, 202, 190, 'Orders', 'orders')}
      {node(250, 306, 200, 'Ad Spend', 'ad')}
    </svg>
  )
}

/** Plays the slider once from 0 to +20% so the first thing people see is a change travelling up. */
function useIntro(set: (v: number) => void) {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return set(20)
    let raf = 0
    const start = performance.now() + 500
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / 1100))
      set(Math.round(20 * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [set])
}

const MIN = -30
const MAX = 60

function Welcome() {
  const { loadSamples } = useImport()
  const [pct, setPct] = useState(0)
  useIntro(setPct)
  const net = ((demo(pct).net - BASE.net) / BASE.net) * 100
  const steps = [
    { icon: FileSpreadsheet, title: 'Add your Excel files', text: 'Sales, marketing, costs: as many files as you have.' },
    { icon: Network, title: 'Connect the numbers', text: 'Show how they add up. Treepath learns the rest from your history.' },
    { icon: SlidersHorizontal, title: 'Ask “what if?”', text: 'Change one number and watch it reach your profit.' },
  ]
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-8 lg:py-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <h1 className="font-display text-[40px] leading-[1.1] text-balance sm:text-[54px]">
              What if Ad Spend went{' '}
              <span className="mark whitespace-nowrap tabular">
                {pct >= 0 ? 'up' : 'down'} {Math.abs(pct)}%
              </span>
              ?
            </h1>
            <p className="mt-5 max-w-[46ch] text-[16.5px] leading-relaxed text-muted">
              Treepath turns your spreadsheets into a map of how your numbers connect, so you can see what one change does to your revenue or
              profit before you make it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="primary" className="h-11 px-5 text-[15px]" onClick={() => void loadSamples()}>
                <Sparkles className="size-4" />
                Try it with sample files
              </Button>
              <FilePicker className="h-11 px-5 text-[15px]">
                <Upload className="size-4" />
                Use my Excel files
              </FilePicker>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
              <Lock className="size-3.5 shrink-0" /> Your files never leave this computer. You can also drop them anywhere on this page.
            </p>
            <a
              href="https://github.com/woraphontrangpanich-jpg/treepath"
              target="_blank"
              rel="noreferrer"
              className="press mt-2 inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12.5px] text-muted hover:border-faint hover:text-ink"
            >
              <svg viewBox="0 0 16 16" className="size-3.5 fill-current" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Open source on GitHub
            </a>
          </div>

          <div className="paper relative overflow-hidden rounded-[28px] border border-line bg-surface/60 p-5 sm:p-7">
            <DemoTree pct={pct} />
            <div className="mt-2 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <label htmlFor="demo-ad" className="text-sm font-semibold">
                  Drag to change Ad Spend
                </label>
                <span className={clsx('font-display text-[15px]', net > 0.05 ? 'text-up' : net < -0.05 ? 'text-down' : 'text-muted')}>
                  Net Revenue {pctText(net)}
                </span>
              </div>
              <input
                id="demo-ad"
                type="range"
                min={MIN}
                max={MAX}
                step={5}
                value={pct}
                onChange={(e) => setPct(Number(e.target.value))}
                className="demo-range mt-3 w-full"
                style={{ '--v': ((pct - MIN) / (MAX - MIN)) * 100 } as CSSProperties}
              />
              <div className="mt-1 flex justify-between text-[11px] text-faint tabular">
                <span>−30%</span>
                <span>+60%</span>
              </div>
            </div>
          </div>
        </div>

        <ol className="mt-14 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3.5 rounded-2xl border border-line bg-surface p-5">
              <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <s.icon className="size-5" />
                <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-ink text-[10.5px] font-bold text-bg tabular">
                  {i + 1}
                </span>
              </span>
              <span>
                <span className="block font-semibold">{s.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export function DataWorkspace() {
  const tables = useStore((s) => s.tables)
  const selectedTableId = useStore((s) => s.selectedTableId)
  const dataView = useStore((s) => s.dataView)
  const table = tables.find((t) => t.id === selectedTableId)

  return (
    <DropZone>
      {tables.length === 0 ? (
        <Welcome />
      ) : (
        <main className={clsx('min-w-0 flex-1', dataView === 'table' && table ? 'overflow-y-auto' : 'overflow-hidden')}>
          {dataView === 'table' && table ? <TableView key={table.id} table={table} /> : <LinksView />}
        </main>
      )}
    </DropZone>
  )
}
