import { clsx } from 'clsx'
import { Sparkles, Upload } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../../state/store'
import { Button } from '../primitives'
import { LinksView } from './LinksView'
import { FilePicker, SourcesPanel } from './SourcesPanel'
import { TableView } from './TableView'
import { useImport } from './useImport'

/** Lets users drop files anywhere on the Data workspace. */
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
            <span className="text-lg font-semibold">Drop Excel or CSV files to import</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Hero: a tiny tree where one change climbs to the outcome, the way Forecast shows it. */
function HeroTree() {
  const node = (x: number, y: number, w: number, label: string, value: string, delta: string, delay: number, opts: { dark?: boolean; down?: boolean } = {}) => (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height="58" rx={opts.dark ? 16 : 10} className={opts.dark ? 'fill-ink' : 'fill-surface stroke-line'} strokeWidth="1" />
      <text x="14" y="22" className={opts.dark ? 'fill-bg' : 'fill-ink'} style={{ fontSize: 12.5, fontWeight: 600 }}>
        {label}
      </text>
      <text x="14" y="45" className={opts.dark ? 'fill-bg' : 'fill-ink'} style={{ fontSize: 19, fontWeight: 600, fontStretch: '125%' }}>
        {value}
      </text>
      <g className="hero-chip" style={{ animationDelay: `${delay}ms` }}>
        <rect x={w - 62} y="31" width="50" height="19" rx="9.5" className={opts.down ? 'fill-down' : 'fill-up'} />
        <text x={w - 37} y="44.5" textAnchor="middle" className="fill-white" style={{ fontSize: 11, fontWeight: 700 }}>
          {delta}
        </text>
      </g>
    </g>
  )
  const edge = (d: string, delay: number, tone: 'up' | 'down') => (
    <g>
      <path d={d} fill="none" strokeWidth="1.75" className="stroke-line" />
      <path d={d} fill="none" strokeWidth="2.5" strokeLinecap="round" pathLength={1} className={`hero-trace ${tone === 'up' ? 'stroke-up' : 'stroke-down'}`} style={{ animationDelay: `${delay}ms` }} />
    </g>
  )
  return (
    <svg viewBox="0 0 460 380" className="w-full max-w-[460px]" role="img" aria-label="Example: Ad Spend up 20% raises Orders 7.8%, Revenue 7.3% and Net Revenue 5%">
      {edge('M300 300 C 300 260, 110 280, 110 236', 300, 'up')}
      {edge('M110 178 C 110 150, 110 150, 110 132', 900, 'up')}
      {edge('M110 74 C 110 40, 230 90, 230 78', 1500, 'up')}
      {edge('M330 300 C 380 200, 300 120, 270 78', 1500, 'down')}
      {node(150, 20, 170, 'Net Revenue', '49.2K', '+5.0%', 2100, { dark: true })}
      {node(20, 74, 180, 'Revenue', '97.7K', '+7.3%', 1500)}
      {node(20, 178, 180, 'Orders', '7,975', '+7.8%', 900)}
      {node(240, 300, 190, 'Ad Spend', '12.6K', '+20%', 200)}
      <text x="250" y="200" className="fill-down hero-chip" style={{ fontSize: 11.5, animationDelay: '1800ms' }}>
        more ad cost
      </text>
    </svg>
  )
}

function Welcome() {
  const { loadSamples } = useImport()
  const steps = ['Add your Excel files', 'Draw how the numbers connect', 'Forecast a change']
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto grid min-h-full max-w-6xl items-center gap-12 px-8 py-12 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <h1 className="font-display text-[44px] leading-[1.05] text-balance sm:text-[56px]">Pull one lever. See it reach the bottom line.</h1>
          <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-muted">
            Treepath turns your spreadsheets into a tree of how your numbers connect, then forecasts what a change does to revenue or
            profit. It runs in your browser, so your files stay on this device.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <FilePicker variant="primary">
              <Upload className="size-4" />
              Import Excel or CSV
            </FilePicker>
            <Button onClick={() => void loadSamples()}>
              <Sparkles className="size-4" />
              Try Sample Data
            </Button>
          </div>
          <p className="mt-3 text-[13px] text-faint">or drop .xlsx, .xls, .csv, .tsv or .ods files anywhere on this page</p>
          <ol className="mt-12 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] font-semibold text-bg tabular">{i + 1}</span>
                  {s}
                </span>
                {i < steps.length - 1 && <span aria-hidden className="h-px w-6 bg-line" />}
              </li>
            ))}
          </ol>
        </div>
        <div className="contour grid place-items-center overflow-hidden rounded-[28px] border border-line p-6">
          <div className="relative w-full">
            <HeroTree />
          </div>
        </div>
      </div>
    </div>
  )
}

export function DataWorkspace() {
  const tables = useStore((s) => s.tables)
  const selectedTableId = useStore((s) => s.selectedTableId)
  const dataView = useStore((s) => s.dataView)
  const table = tables.find((t) => t.id === selectedTableId) ?? tables[0]

  return (
    <DropZone>
      {tables.length === 0 ? (
        <Welcome />
      ) : (
        <>
          <SourcesPanel />
          <main className={clsx('min-w-0 flex-1 overflow-y-auto')}>
            {dataView === 'links' ? <LinksView /> : table && <TableView key={table.id} table={table} />}
          </main>
        </>
      )}
    </DropZone>
  )
}
