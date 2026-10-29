import { clsx } from 'clsx'
import { AlertTriangle, ArrowLeft, Calendar, Hash, Info, KeyRound, ToggleLeft, Trash2, Type } from 'lucide-react'
import { useMemo, useState } from 'react'
import { aggregateSeries, tableHealth } from '../../data/series'
import type { Aggregation, Column, ColumnRole, ColumnType, Table } from '../../data/types'
import { formatCell, plural } from '../../lib/format'
import { useStore } from '../../state/store'
import { Badge, Button, SectionTitle, Select } from '../primitives'
import { Sparkline } from '../Sparkline'

const TYPE_ICON: Record<ColumnType, typeof Hash> = {
  number: Hash,
  date: Calendar,
  text: Type,
  boolean: ToggleLeft,
  empty: Type,
}

const ROLE_LABEL: Record<ColumnRole, string> = {
  date: 'Date',
  key: 'ID or group',
  metric: 'Number to track',
  dimension: 'ID or group',
  ignore: 'Don’t use',
}

const AGG_LABEL: Record<Aggregation, string> = {
  sum: 'Add up',
  avg: 'Average',
  count: 'Count rows',
  min: 'Min',
  max: 'Max',
  last: 'Last value',
}
const AGGS: Aggregation[] = ['sum', 'avg', 'count']

function rolesFor(type: ColumnType): ColumnRole[] {
  if (type === 'date') return ['date', 'ignore']
  if (type === 'number') return ['metric', 'key', 'ignore']
  return ['key', 'ignore']
}

export function TableView({ table }: { table: Table }) {
  const { renameTable, removeTable, setDataView } = useStore.getState()
  const health = useMemo(() => tableHealth(table).filter((h) => h.level !== 'ok'), [table])
  const dateCol = table.columns.find((c) => c.role === 'date')

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <button
        type="button"
        onClick={() => setDataView('links')}
        className="press -mb-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium text-accent hover:bg-accent-soft"
      >
        <ArrowLeft className="size-4" /> All files
      </button>
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <input
            value={table.name}
            onChange={(e) => renameTable(table.id, e.target.value)}
            aria-label="Table name"
            name="table-name"
            autoComplete="off"
            className="font-display w-full rounded-md bg-transparent text-[26px] outline-none hover:bg-surface focus:bg-surface"
          />
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>
              {table.fileName}
              {!/\.(csv|tsv)$/i.test(table.fileName) && <> › {table.sheetName}</>}
            </span>
            <span className="tabular">{plural(table.rows.length, 'row')}</span>
            <span className="tabular">{plural(table.columns.length, 'column')}</span>
            {dateCol && dateCol.profile.min !== null && (
              <span className="tabular">
                {String(dateCol.profile.min)} to {String(dateCol.profile.max)}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="danger"
          onClick={() => {
            if (!confirm(`Remove “${table.name}” and its connections?`)) return
            removeTable(table.id)
            setDataView('links')
          }}
        >
          <Trash2 className="size-4" />
          Remove file
        </Button>
      </header>

      {health.length > 0 && (
        <ul className="space-y-1.5">
          {health.map((h, i) => (
            <li
              key={i}
              className={clsx(
                'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
                h.level === 'warn' ? 'bg-warn-soft text-ink' : 'bg-surface-2 text-muted ring-1 ring-line',
              )}
            >
              {h.level === 'warn' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" /> : <Info className="mt-0.5 size-4 shrink-0" />}
              {h.message}
            </li>
          ))}
        </ul>
      )}

      <ColumnMapping table={table} />
      <DataPreview table={table} />
    </div>
  )
}

function ColumnMapping({ table }: { table: Table }) {
  const updateColumn = useStore((s) => s.updateColumn)
  return (
    <section>
      <SectionTitle aside={<span className="text-xs text-faint">Treepath guessed these. Change any that look wrong.</span>}>
        Columns
      </SectionTitle>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Column</th>
              <th className="px-3 py-2.5 font-medium">What it is</th>
              <th className="px-3 py-2.5 font-medium">Many rows on one day</th>
              <th className="px-3 py-2.5 font-medium">Values</th>
              <th className="px-3 py-2.5 font-medium">Monthly trend</th>
            </tr>
          </thead>
          <tbody>
            {table.columns.map((c) => (
              <ColumnRow key={c.name} table={table} column={c} onChange={(patch) => updateColumn(table.id, c.name, patch)} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ColumnRow({
  table,
  column: c,
  onChange,
}: {
  table: Table
  column: Column
  onChange: (patch: Partial<Pick<Column, 'role' | 'aggregation'>>) => void
}) {
  const Icon = c.role === 'key' ? KeyRound : TYPE_ICON[c.type]
  const trend = useMemo(
    () => (c.role === 'metric' ? aggregateSeries(table, c.name, { grain: 'month', aggregation: c.aggregation }) : []),
    [table, c.name, c.role, c.aggregation],
  )
  const p = c.profile
  return (
    <tr className={clsx('border-b border-line last:border-0', c.role === 'ignore' && 'opacity-55')}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'grid size-6 shrink-0 place-items-center rounded-md',
              c.role === 'metric' ? 'bg-accent-soft text-accent' : c.role === 'date' ? 'bg-formula-soft text-formula' : 'bg-surface-2 text-muted',
            )}
          >
            <Icon className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{c.name}</div>
            <div className="text-xs text-faint">
              {c.type}
              {c.format === 'percent' && ', percent'}
              {p.nulls > 0 && `, ${p.nulls.toLocaleString()} blank`}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <Select value={c.role} onChange={(e) => onChange({ role: e.target.value as ColumnRole })} aria-label={`Role of ${c.name}`}>
          {rolesFor(c.type).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-3 py-2.5">
        {c.role === 'metric' ? (
          <Select value={c.aggregation} onChange={(e) => onChange({ aggregation: e.target.value as Aggregation })} aria-label={`Aggregation of ${c.name}`}>
            {[...new Set([...AGGS, c.aggregation])].map((a) => (
              <option key={a} value={a}>
                {AGG_LABEL[a]}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-xs text-faint">—</span>
        )}
      </td>
      <td className="max-w-72 px-3 py-2.5 text-xs text-muted tabular">
        {c.type === 'number' || c.type === 'date' ? (
          <span className="whitespace-nowrap">
            {formatCell(p.min, c)} – {formatCell(p.max, c)}
          </span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {p.samples.slice(0, 4).map((s, i) => (
              <Badge key={i}>{formatCell(s, c)}</Badge>
            ))}
            {p.distinct > 4 && <span className="text-faint">+{(p.distinct - 4).toLocaleString()}</span>}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">{c.role === 'metric' ? <Sparkline points={trend} /> : null}</td>
    </tr>
  )
}

const PAGE = 50

function DataPreview({ table }: { table: Table }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(table.rows.length / PAGE))
  const current = Math.min(page, pages - 1)
  const rows = table.rows.slice(current * PAGE, current * PAGE + PAGE)
  return (
    <section>
      <SectionTitle
        aside={
          <div className="flex items-center gap-2 text-xs text-muted tabular">
            <Button size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
              Prev
            </Button>
            {current + 1} / {pages}
            <Button size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              Next
            </Button>
          </div>
        }
      >
        Preview
      </SectionTitle>
      <div className="max-h-[480px] overflow-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-xs tabular">
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              <th className="border-b border-line px-3 py-2 text-right font-normal text-faint">#</th>
              {table.columns.map((c) => (
                <th key={c.name} className={clsx('border-b border-line px-3 py-2 font-medium whitespace-nowrap', c.type === 'number' ? 'text-right' : 'text-left')}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-surface-2">
                <td className="border-b border-line px-3 py-1.5 text-right text-faint">{current * PAGE + i + 1}</td>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={clsx(
                      'border-b border-line px-3 py-1.5 whitespace-nowrap',
                      table.columns[j].type === 'number' && 'text-right',
                      cell === null && 'text-faint',
                    )}
                  >
                    {cell === null ? '·' : formatCell(cell, table.columns[j])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

