import { clsx } from 'clsx'
import { ArrowRight, Link2, Plus, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { findTable, linkStats, suggestLinks, type LinkStats } from '../../data/links'
import type { ColumnRef, Link, Table } from '../../data/types'
import { useStore } from '../../state/store'
import { Badge, Button, SectionTitle, Select } from '../primitives'

function refLabel(tables: Table[], ref: ColumnRef) {
  const t = findTable(tables, ref)
  return { table: t?.name ?? '(missing table)', column: ref.column }
}

function MatchBadge({ stats }: { stats: LinkStats | null }) {
  if (!stats) return <Badge tone="down">broken</Badge>
  const pct = Math.round(stats.matchRate * 100)
  return <Badge tone={pct >= 95 ? 'accent' : pct >= 60 ? 'warn' : 'down'}>{pct}% match</Badge>
}

function LinkEnds({ tables, from, to }: { tables: Table[]; from: ColumnRef; to: ColumnRef }) {
  const a = refLabel(tables, from)
  const b = refLabel(tables, to)
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
      <span className="truncate">
        <span className="text-muted">{a.table}</span> · <span className="font-medium">{a.column}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-faint" />
      <span className="truncate">
        <span className="text-muted">{b.table}</span> · <span className="font-medium">{b.column}</span>
      </span>
    </div>
  )
}

export function LinksView() {
  const tables = useStore((s) => s.tables)
  const links = useStore((s) => s.links)
  const { addLink, removeLink } = useStore.getState()
  const suggestions = useMemo(() => suggestLinks(tables, links), [tables, links])

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Table links</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Link tables through a shared key column, like a primary key. All tables are already lined up by date, so links are for
          keys such as <span className="font-mono text-ink">region_code</span> or <span className="font-mono text-ink">store_id</span>. Links let a
          metric from one file be filtered or broken down by attributes in another.
        </p>
      </header>

      <LinkDiagram tables={tables} links={links} />

      {suggestions.length > 0 && (
        <section>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-accent" />
              Suggested
            </span>
          </SectionTitle>
          <ul className="space-y-2">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-4 py-3">
                <LinkEnds tables={tables} from={s.from} to={s.to} />
                <Badge>{s.reason}</Badge>
                <Badge>{s.stats.cardinality}</Badge>
                <MatchBadge stats={s.stats} />
                <Button size="sm" variant="primary" onClick={() => addLink({ from: s.from, to: s.to })}>
                  <Plus className="size-3.5" />
                  Link
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle>Active links</SectionTitle>
        {links.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
            No links yet. Accept a suggestion above or create one below.
          </p>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => (
              <ActiveLink key={l.id} link={l} tables={tables} onRemove={() => removeLink(l.id)} />
            ))}
          </ul>
        )}
      </section>

      <NewLinkForm tables={tables} onAdd={addLink} />
    </div>
  )
}

function ActiveLink({ link, tables, onRemove }: { link: Link; tables: Table[]; onRemove: () => void }) {
  const stats = useMemo(() => linkStats(tables, link), [tables, link])
  return (
    <li className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <Link2 className="size-4 shrink-0 text-accent" />
        <LinkEnds tables={tables} from={link.from} to={link.to} />
        {stats && <Badge>{stats.cardinality}</Badge>}
        <MatchBadge stats={stats} />
        <button type="button" onClick={onRemove} className="rounded-md p-1 text-faint hover:bg-down-soft hover:text-down" aria-label="Remove link">
          <X className="size-4" />
        </button>
      </div>
      {stats && stats.unmatchedSamples.length > 0 && (
        <p className="mt-2 pl-7 text-xs text-muted">
          {(stats.fromDistinct - stats.matched).toLocaleString()} value(s) have no match, e.g.{' '}
          {stats.unmatchedSamples.map((v) => (
            <span key={String(v)} className="mr-1 font-mono text-ink">
              {String(v)}
            </span>
          ))}
        </p>
      )}
    </li>
  )
}

function columnOptions(t: Table | undefined) {
  return t?.columns.filter((c) => c.role !== 'ignore' && c.role !== 'date' && c.type !== 'empty') ?? []
}

function NewLinkForm({ tables, onAdd }: { tables: Table[]; onAdd: (l: Omit<Link, 'id'>) => void }) {
  const [from, setFrom] = useState<ColumnRef>({ tableId: '', column: '' })
  const [to, setTo] = useState<ColumnRef>({ tableId: '', column: '' })
  const ready = from.tableId && from.column && to.tableId && to.column && from.tableId !== to.tableId
  const stats = useMemo(() => (ready ? linkStats(tables, { from, to }) : null), [ready, tables, from, to])

  const side = (value: ColumnRef, set: (r: ColumnRef) => void, label: string) => {
    const t = tables.find((x) => x.id === value.tableId)
    return (
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">{label}</span>
        <Select value={value.tableId} onChange={(e) => set({ tableId: e.target.value, column: '' })}>
          <option value="">Choose table…</option>
          {tables.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
        <Select value={value.column} disabled={!t} onChange={(e) => set({ ...value, column: e.target.value })}>
          <option value="">Choose column…</option>
          {columnOptions(t).map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.role})
            </option>
          ))}
        </Select>
      </div>
    )
  }

  return (
    <section>
      <SectionTitle>Create a link</SectionTitle>
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          {side(from, setFrom, 'From (many rows, e.g. daily sales)')}
          <ArrowRight className="mx-auto mb-2 hidden size-4 text-faint sm:block" />
          {side(to, setTo, 'To (lookup, e.g. regions list)')}
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          {stats && (
            <span className="text-xs text-muted">
              {stats.matched} of {stats.fromDistinct} values match · {stats.cardinality}
            </span>
          )}
          {stats && <MatchBadge stats={stats} />}
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => {
              onAdd({ from, to })
              setFrom({ tableId: '', column: '' })
              setTo({ tableId: '', column: '' })
            }}
          >
            <Plus className="size-4" />
            Add link
          </Button>
        </div>
      </div>
    </section>
  )
}

const BOX_W = 200
const BOX_H = 52
const GAP_X = 70
const GAP_Y = 56

function LinkDiagram({ tables, links }: { tables: Table[]; links: Link[] }) {
  if (tables.length === 0) return null
  const cols = Math.min(3, tables.length)
  const rows = Math.ceil(tables.length / cols)
  const width = cols * BOX_W + (cols - 1) * GAP_X
  const height = rows * BOX_H + (rows - 1) * GAP_Y
  const pos = new Map(
    tables.map((t, i) => [t.id, { x: (i % cols) * (BOX_W + GAP_X), y: Math.floor(i / cols) * (BOX_H + GAP_Y) }]),
  )
  const linked = new Set(links.flatMap((l) => [l.from.tableId, l.to.tableId]))

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface p-6">
      <svg viewBox={`-4 -4 ${width + 8} ${height + 8}`} width={width + 8} className="mx-auto block max-w-full" role="img" aria-label="Diagram of linked tables">
        {links.map((l) => {
          const a = pos.get(l.from.tableId)
          const b = pos.get(l.to.tableId)
          if (!a || !b) return null
          const x1 = a.x + BOX_W / 2
          const y1 = a.y + BOX_H / 2
          const x2 = b.x + BOX_W / 2
          const y2 = b.y + BOX_H / 2
          return (
            <g key={l.id}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="2" className="stroke-accent" />
              <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="fill-muted font-mono text-[10px]">
                {l.from.column === l.to.column ? l.from.column : `${l.from.column} = ${l.to.column}`}
              </text>
            </g>
          )
        })}
        {tables.map((t) => {
          const p = pos.get(t.id)!
          return (
            <g key={t.id} transform={`translate(${p.x},${p.y})`}>
              <rect
                width={BOX_W}
                height={BOX_H}
                rx="10"
                strokeWidth="1.5"
                className={clsx('fill-surface', linked.has(t.id) ? 'stroke-accent' : 'stroke-line')}
              />
              <text x="14" y="22" className="fill-ink text-[13px] font-semibold">
                {t.name.length > 24 ? `${t.name.slice(0, 23)}…` : t.name}
              </text>
              <text x="14" y="39" className="fill-muted text-[11px]">
                {t.columns.filter((c) => c.role === 'metric').length} metrics · {t.rows.length.toLocaleString()} rows
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
