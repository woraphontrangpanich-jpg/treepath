import { clsx } from 'clsx'
import { BarChart3, ChartLine, ChartScatter, Lightbulb, Table2, Waves } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { Grain, Table } from '../../data/types'
import { formatValue } from '../../lib/format'
import { useStore } from '../../state/store'
import { linearFit, movingAverage, strength, summarize } from '../../model/trend'
import { Segmented, Select } from '../primitives'
import { BarChart, Histogram, LineChart, Legend, ScatterChart } from './kit'
import { columnValues, fmtOf, groupBars, groupColumns, hasDate, nextDates, numberColumns, scatterDots, trendSeries } from './data'

type Kind = 'trend' | 'compare' | 'relationship' | 'spread'

const KINDS: { value: Kind; label: string; text: string; icon: typeof ChartLine }[] = [
  { value: 'trend', label: 'Trend over time', text: 'See where a number is heading, and forecast it', icon: ChartLine },
  { value: 'compare', label: 'Compare groups', text: 'Which region, product or channel is biggest', icon: BarChart3 },
  { value: 'relationship', label: 'Relationship', text: 'Does one number move with another? Try “what if”', icon: ChartScatter },
  { value: 'spread', label: 'Spread', text: 'How values are spread out, and what is typical', icon: Waves },
]

const GRAIN_WORD: Record<Grain, string> = { day: 'day', week: 'week', month: 'month' }
const pText = (p: number) => (p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`)

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  )
}

function Insight({ lines }: { lines: ReactNode[] }) {
  if (!lines.length) return null
  return (
    <div className="flex gap-3 rounded-xl bg-pop-soft px-4 py-3 text-[13.5px] leading-relaxed text-ink">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-warn" />
      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className="font-display text-[19px] leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-faint">{sub}</div>}
    </div>
  )
}

export function ChartsWorkspace() {
  const tables = useStore((s) => s.tables)
  const [tableId, setTableId] = useState(() => tables.find((t) => numberColumns(t).length > 0)?.id ?? tables[0]?.id)
  const table = tables.find((t) => t.id === tableId) ?? tables[0]
  const [kind, setKind] = useState<Kind>('trend')
  if (!table) return null
  const kinds = KINDS.map((k) => ({ ...k, disabled: (k.value === 'trend' && !hasDate(table)) || (k.value === 'compare' && groupColumns(table).length === 0) }))
  const active = kinds.find((k) => k.value === kind && !k.disabled) ? kind : (kinds.find((k) => !k.disabled)?.value ?? 'spread')

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-72 shrink-0 space-y-5 overflow-y-auto border-r border-line bg-surface p-4">
        <Field label="File">
          <Select value={table.id} onChange={(e) => setTableId(e.target.value)} className="w-full">
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <span className="mb-1.5 block text-[12.5px] font-medium text-muted">What do you want to see?</span>
          <div className="space-y-1.5">
            {kinds.map((k) => (
              <button
                key={k.value}
                type="button"
                disabled={k.disabled}
                onClick={() => setKind(k.value)}
                title={k.disabled ? (k.value === 'trend' ? 'This file has no date column' : 'This file has no group column') : undefined}
                className={clsx(
                  'press flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-40',
                  active === k.value ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
                )}
              >
                <k.icon className={clsx('mt-0.5 size-4 shrink-0', active === k.value ? 'text-accent' : 'text-faint')} />
                <span>
                  <span className="block text-[13px] font-semibold">{k.label}</span>
                  <span className="block text-[11.5px] leading-snug text-muted">{k.text}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        {numberColumns(table).length === 0 ? (
          <p className="text-sm text-muted">This file has no number columns to chart. Pick another file, or mark a column as “Number to track” on the Files page.</p>
        ) : active === 'trend' ? (
          <TrendView key={table.id} table={table} />
        ) : active === 'compare' ? (
          <CompareView key={table.id} table={table} />
        ) : active === 'relationship' ? (
          <RelationshipView key={table.id} table={table} />
        ) : (
          <SpreadView key={table.id} table={table} />
        )}
      </main>
    </div>
  )
}

/** Chart controls sit in a row above the chart, so the left panel stays about picking the chart. */
function Controls({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-display text-[18px]">{title}</h2>
      {children}
    </section>
  )
}

function NumberSelect({ table, value, onChange, exclude }: { table: Table; value: string; onChange: (v: string) => void; exclude?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-40">
      {numberColumns(table)
        .filter((c) => c.name !== exclude)
        .map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
          </option>
        ))}
    </Select>
  )
}

function GroupSelect({ table, value, onChange, none }: { table: Table; value: string; onChange: (v: string) => void; none?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-36">
      {none && <option value="">{none}</option>}
      {groupColumns(table).map((c) => (
        <option key={c.name} value={c.name}>
          {c.name}
        </option>
      ))}
    </Select>
  )
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline">
        <Table2 className="size-3.5" /> {open ? 'Hide the numbers' : 'Show the numbers'}
      </button>
      {open && (
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-line">
          <table className="w-full text-[12.5px] tabular">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                {head.map((h) => (
                  <th key={h} className="px-3 py-1.5 text-left font-medium text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-1">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TrendView({ table }: { table: Table }) {
  const nums = numberColumns(table)
  const [metric, setMetric] = useState(nums[0].name)
  const [group, setGroup] = useState('')
  const [grain, setGrain] = useState<Grain>('week')
  const [agg, setAgg] = useState<'sum' | 'avg'>(nums[0].aggregation === 'avg' ? 'avg' : 'sum')
  const [ahead, setAhead] = useState(8)
  const [smooth, setSmooth] = useState(false)
  const col = nums.find((c) => c.name === metric)
  const fmt = fmtOf(col)

  const series = useMemo(() => trendSeries(table, metric, agg, grain, group || undefined), [table, metric, agg, grain, group])
  const shown = smooth
    ? series.map((s) => ({ ...s, points: movingAverage(s.points.map((p) => p.value), grain === 'day' ? 7 : 4).map((v, i) => ({ ...s.points[i], value: v })) }))
    : series
  // The trend line is fitted on the single series (or the total when split).
  const base = useMemo(() => (series.length === 1 ? series[0].points : trendSeries(table, metric, agg, grain)[0].points), [series, table, metric, agg, grain])
  const fit = useMemo(() => linearFit(base.map((_, i) => i), base.map((p) => p.value)), [base])
  const band =
    fit && !group
      ? {
          name: 'Trend',
          forecastFrom: ahead > 0 ? base.at(-1)!.date : undefined,
          points: [...base.map((p) => p.date), ...nextDates(base.at(-1)!.date, grain, ahead)].map((date, i) => {
            const [lo, hi] = fit.interval(i, i >= base.length ? 'point' : 'mean')
            return { date, value: fit.predict(i), lo, hi }
          }),
        }
      : undefined

  const lines: ReactNode[] = []
  if (fit) {
    const startV = fit.predict(0)
    const endV = fit.predict(base.length - 1)
    const dir = fit.slope > 0 ? 'up' : 'down'
    lines.push(
      <>
        The trend is <b>{dir}</b> by about <b>{formatValue(Math.abs(fit.slope), fmt)}</b> per {GRAIN_WORD[grain]}
        {startV > 0 ? `, ${dir === 'up' ? '+' : '−'}${Math.abs(((endV - startV) / startV) * 100).toFixed(0)}% over the whole period` : ''}.
      </>,
    )
    lines.push(
      fit.p < 0.05 ? (
        <>
          This trend is unlikely to be chance ({pText(fit.p)}). The straight line explains {(fit.r2 * 100).toFixed(0)}% of the ups and downs.
        </>
      ) : (
        <>The line is not clearly different from flat ({pText(fit.p)}), so treat the direction as uncertain.</>
      ),
    )
    if (ahead > 0 && band) {
      const last = band.points.at(-1)!
      lines.push(
        <>
          If the trend holds, in {ahead} {GRAIN_WORD[grain]}s {metric} is about <b>{formatValue(last.value, fmt)}</b> (likely {formatValue(last.lo, fmt)} to{' '}
          {formatValue(last.hi, fmt)}).
        </>,
      )
    }
  }

  return (
    <div className="space-y-4">
      <Controls>
        <Field label="Number">
          <NumberSelect table={table} value={metric} onChange={setMetric} />
        </Field>
        <Field label="Split by">
          <GroupSelect table={table} value={group} onChange={setGroup} none="Nothing (total)" />
        </Field>
        <Field label="Per">
          <Segmented size="sm" value={grain} onChange={setGrain} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        </Field>
        <Field label="Many rows in one period">
          <Segmented size="sm" value={agg} onChange={setAgg} options={[{ value: 'sum', label: 'Add up' }, { value: 'avg', label: 'Average' }]} />
        </Field>
        <Field label="Forecast ahead">
          <Select value={ahead} onChange={(e) => setAhead(Number(e.target.value))} disabled={!!group}>
            {[0, 4, 8, 12, 26].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'No forecast' : `${n} ${GRAIN_WORD[grain]}s`}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex h-8 items-center gap-2 text-[13px]">
          <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} className="accent-[var(--accent)]" />
          Smooth the line
        </label>
      </Controls>
      <Card title={`${metric} per ${GRAIN_WORD[grain]}${group ? `, by ${group}` : ''}`}>
        <Insight lines={group ? [<>Trend line and forecast show for the total. Choose “Nothing (total)” to see them.</>] : lines} />
        <Legend items={[...shown.map((s) => ({ name: s.name, color: s.color })), ...(band ? [{ name: 'Trend and forecast', color: 'var(--ink)', dashed: true }] : [])]} />
        <LineChart series={shown} band={band} fmt={fmt} />
        {fit && !group && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={`Change per ${GRAIN_WORD[grain]}`} value={`${fit.slope >= 0 ? '+' : '−'}${formatValue(Math.abs(fit.slope), fmt)}`} sub="slope of the trend line" />
            <Stat label="Fit (R²)" value={`${(fit.r2 * 100).toFixed(0)}%`} sub="share of ups and downs explained" />
            <Stat label="Significance" value={pText(fit.p)} sub={fit.p < 0.05 ? 'real trend' : 'could be chance'} />
            <Stat label="Periods" value={fit.n.toLocaleString()} sub={`${GRAIN_WORD[grain]}s of history`} />
          </div>
        )}
        <DataTable
          head={['Date', ...series.map((s) => s.name)]}
          rows={(series[0]?.points ?? []).map((p, i) => [p.date, ...series.map((s) => formatValue(s.points.find((q) => q.date === p.date)?.value ?? s.points[i]?.value, fmt))])}
        />
      </Card>
    </div>
  )
}

function CompareView({ table }: { table: Table }) {
  const nums = numberColumns(table)
  const groups = groupColumns(table)
  const [metric, setMetric] = useState(nums[0].name)
  const [group, setGroup] = useState(groups[0].name)
  const [agg, setAgg] = useState<'sum' | 'avg' | 'count'>('sum')
  const fmt = agg === 'count' ? 'number' : fmtOf(nums.find((c) => c.name === metric))
  const rows = useMemo(() => groupBars(table, metric, agg, group), [table, metric, agg, group])
  const top = rows.slice(0, 15)
  const total = rows.reduce((a, r) => a + r.value, 0)
  const lines: ReactNode[] = []
  if (rows.length >= 2) {
    const [a, b] = [rows[0], rows.at(-1)!]
    lines.push(
      <>
        <b>{a.label}</b> is the biggest at <b>{formatValue(a.value, fmt)}</b>
        {b.value > 0 ? `, ${(a.value / b.value).toFixed(1)}× the smallest (${b.label})` : ''}.
      </>,
    )
    if (agg !== 'avg' && total > 0) lines.push(<>{a.label} makes up {((a.value / total) * 100).toFixed(0)}% of the total across {rows.length} groups.</>)
    if (rows.length > 15) lines.push(<>Showing the top 15 of {rows.length} groups.</>)
  }
  const what = agg === 'count' ? 'Rows' : `${agg === 'sum' ? 'Total' : 'Average'} ${metric}`
  return (
    <div className="space-y-4">
      <Controls>
        <Field label="Number">
          <NumberSelect table={table} value={metric} onChange={setMetric} />
        </Field>
        <Field label="Group by">
          <GroupSelect table={table} value={group} onChange={setGroup} />
        </Field>
        <Field label="Show">
          <Segmented size="sm" value={agg} onChange={setAgg} options={[{ value: 'sum', label: 'Total' }, { value: 'avg', label: 'Average' }, { value: 'count', label: 'Count rows' }]} />
        </Field>
      </Controls>
      <Card title={`${what} by ${group}`}>
        <Insight lines={lines} />
        <BarChart rows={top} fmt={fmt} />
        <DataTable head={[group, what, 'Rows']} rows={rows.map((r) => [r.label, formatValue(r.value, fmt), r.n])} />
      </Card>
    </div>
  )
}

function RelationshipView({ table }: { table: Table }) {
  const nums = numberColumns(table)
  const [xName, setX] = useState(nums[0].name)
  const [yName, setY] = useState((nums[1] ?? nums[0]).name)
  const [group, setGroup] = useState('')
  const xc = nums.find((c) => c.name === xName)
  const yc = nums.find((c) => c.name === yName)
  const { dots, groups, total } = useMemo(() => scatterDots(table, xName, yName, group || undefined), [table, xName, yName, group])
  const xs = columnValues(table, xName)
  const fit = useMemo(() => {
    const pairs = scatterDots(table, xName, yName, undefined, Infinity).dots
    return linearFit(
      pairs.map((d) => d.x),
      pairs.map((d) => d.y),
    )
  }, [table, xName, yName])
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const [simX, setSimX] = useState<number | null>(null)
  const sim = simX ?? (fit ? fit.xMean : 0)
  const marker = fit ? (() => {
    const [lo, hi] = fit.interval(sim, 'point')
    return { x: sim, y: fit.predict(sim), lo, hi }
  })() : undefined
  const fx = fmtOf(xc)
  const fy = fmtOf(yc)
  const unitX = fx === 'percent' ? 0.01 : 10 ** Math.floor(Math.log10(Math.max(1e-9, (xMax - xMin) / 10)))
  const lines: ReactNode[] = []
  if (fit) {
    lines.push(
      <>
        When {xName} goes up by <b>{formatValue(unitX, fx)}</b>, {yName} tends to go {fit.slope >= 0 ? 'up' : 'down'} by <b>{formatValue(Math.abs(fit.slope * unitX), fy)}</b>.
      </>,
    )
    lines.push(
      <>
        The link is <b>{strength(fit.r)}</b> (correlation {fit.r.toFixed(2)}, {pText(fit.p)}){fit.p < 0.05 ? ', so it is unlikely to be chance' : ', so it could be chance'}. Moving together
        doesn’t prove one causes the other.
      </>,
    )
  }
  return (
    <div className="space-y-4">
      <Controls>
        <Field label="Across (X)">
          <NumberSelect table={table} value={xName} onChange={(v) => (setX(v), setSimX(null))} />
        </Field>
        <Field label="Up (Y)">
          <NumberSelect table={table} value={yName} onChange={setY} />
        </Field>
        <Field label="Colour by">
          <GroupSelect table={table} value={group} onChange={setGroup} none="Nothing" />
        </Field>
      </Controls>
      <Card title={`${yName} against ${xName}`}>
        <Insight lines={lines} />
        <Legend items={groups.map((g) => ({ name: g.name, color: g.color }))} />
        <ScatterChart
          dots={dots}
          groups={groups}
          line={fit ? { at: fit.predict, band: (x) => fit.interval(x, 'mean') } : undefined}
          marker={marker}
          fmtX={fx}
          fmtY={fy}
          labelX={xName}
          labelY={yName}
        />
        {total > dots.length && <p className="text-[11.5px] text-faint">Showing {dots.length.toLocaleString()} of {total.toLocaleString()} rows; the line uses all of them.</p>}
        {fit && marker && (
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">What if {xName} were…</span>
              <span className="font-display text-[22px]">{formatValue(sim, fx)}</span>
            </div>
            <input
              type="range"
              min={xMin}
              max={xMax + (xMax - xMin) * 0.5}
              step={(xMax - xMin) / 200 || 1}
              value={sim}
              onChange={(e) => setSimX(Number(e.target.value))}
              className="demo-range mt-3 w-full"
              style={{ '--v': ((sim - xMin) / ((xMax - xMin) * 1.5 || 1)) * 100 } as React.CSSProperties}
              aria-label={`What if ${xName}`}
            />
            <p className="mt-3 text-[14px]">
              Then {yName} would be about <b className="font-display text-[18px]">{formatValue(marker.y, fy)}</b>
              <span className="text-muted">
                {' '}
                (a single case is likely between {formatValue(marker.lo, fy)} and {formatValue(marker.hi, fy)})
              </span>
            </p>
            {sim > xMax && <p className="mt-1 text-[12px] text-warn">This is beyond anything in your data, so the estimate is a stretch.</p>}
          </div>
        )}
        {fit && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Correlation" value={fit.r.toFixed(2)} sub={strength(fit.r)} />
            <Stat label="Fit (R²)" value={`${(fit.r2 * 100).toFixed(0)}%`} sub={`of ${yName} explained`} />
            <Stat label="Slope" value={formatValue(fit.slope, 'number')} sub={`${yName} per 1 ${xName}`} />
            <Stat label="Significance" value={pText(fit.p)} sub={`${fit.n.toLocaleString()} rows`} />
          </div>
        )}
      </Card>
    </div>
  )
}

function SpreadView({ table }: { table: Table }) {
  const nums = numberColumns(table)
  const [metric, setMetric] = useState(nums[0].name)
  const [bins, setBins] = useState(20)
  const fmt = fmtOf(nums.find((c) => c.name === metric))
  const values = useMemo(() => columnValues(table, metric), [table, metric])
  const s = summarize(values)
  const lines: ReactNode[] = []
  if (s) {
    lines.push(
      <>
        The middle half of rows falls between <b>{formatValue(s.q1, fmt)}</b> and <b>{formatValue(s.q3, fmt)}</b>; the typical (middle) value is{' '}
        <b>{formatValue(s.median, fmt)}</b>.
      </>,
    )
    const skew = (s.mean - s.median) / (Math.abs(s.median) || 1)
    if (skew > 0.1) lines.push(<>A few large values pull the average ({formatValue(s.mean, fmt)}) above the middle value.</>)
    else if (skew < -0.1) lines.push(<>A few small values pull the average ({formatValue(s.mean, fmt)}) below the middle value.</>)
  }
  return (
    <div className="space-y-4">
      <Controls>
        <Field label="Number">
          <NumberSelect table={table} value={metric} onChange={setMetric} />
        </Field>
        <Field label={`Bars: ${bins}`}>
          <input type="range" min={5} max={50} value={bins} onChange={(e) => setBins(Number(e.target.value))} className="h-8 w-40 accent-[var(--accent)]" />
        </Field>
      </Controls>
      <Card title={`How ${metric} is spread`}>
        <Insight lines={lines} />
        {s && (
          <Histogram
            values={values}
            bins={bins}
            fmt={fmt}
            marks={[
              { name: 'Average', value: s.mean },
              { name: 'Middle', value: s.median },
            ]}
          />
        )}
        {s && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Average" value={formatValue(s.mean, fmt)} />
            <Stat label="Middle value" value={formatValue(s.median, fmt)} sub="median" />
            <Stat label="Lowest to highest" value={`${formatValue(s.min, fmt)} to ${formatValue(s.max, fmt)}`} />
            <Stat label="Typical distance from average" value={formatValue(s.std, fmt)} sub="standard deviation" />
          </div>
        )}
      </Card>
    </div>
  )
}
