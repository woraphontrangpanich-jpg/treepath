import { clsx } from 'clsx'
import { FileUp, GitBranch, Link2, Sparkles, Upload } from 'lucide-react'
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

function Welcome() {
  const { loadSamples } = useImport()
  const steps = [
    { icon: FileUp, title: 'Data', text: 'Add Excel or CSV files. Dates, IDs and metrics are detected for you.' },
    { icon: GitBranch, title: 'Build', text: 'Draw how your metrics add up to one outcome, like Net Revenue.' },
    { icon: Link2, title: 'Forecast', text: 'Type a change, like “increase Ad Spend 20%”, and see the impact.' },
  ]
  return (
    <div className="grid flex-1 place-items-center overflow-y-auto p-8">
      <div className="w-full max-w-3xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance">See how every change reaches your bottom line.</h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted text-balance">
          Upload your Excel files, draw how your numbers connect, and forecast what happens to revenue or profit when something
          changes. Everything runs in your browser; your files never leave this device.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <FilePicker variant="primary">
            <Upload className="size-4" />
            Import Excel / CSV
          </FilePicker>
          <Button onClick={() => void loadSamples()}>
            <Sparkles className="size-4" />
            Try Sample Data
          </Button>
        </div>
        <p className="mt-3 text-xs text-faint">or drop files anywhere on this page · .xlsx .xls .csv .tsv .ods</p>

        <ol className="mt-12 grid gap-4 text-left sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent">
                  <s.icon className="size-4" />
                </span>
                <span className="text-xs font-medium text-faint">Step {i + 1}</span>
              </div>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
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
