import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatValue } from '../../lib/format'

/** Fixed series order; a 7th group folds into "Other". */
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)']
export const OTHER = 'var(--s-other)'

type Fmt = 'percent' | 'number' | undefined

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) {
    min -= 1
    max += 1
  }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  const first = Math.floor(min / step) * step
  // Always end on a tick at or above the maximum, so marks never poke out of the plot.
  for (let v = first; out.length === 0 || out[out.length - 1] < max - step * 1e-9; v += step) out.push(Math.round(v / step) * step)
  return out
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function dateLabel(iso: string, long = false) {
  const [y, m, d] = iso.split('-').map(Number)
  if (long) return `${d} ${MONTHS[m - 1]} ${y}`
  return d === 1 ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : `${d} ${MONTHS[m - 1]}`
}
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(8, x + 14), width - 200)
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[220px] rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-[0_10px_30px_-12px_rgb(17_42_51/0.45)]"
      style={{ left, top: Math.max(4, y - 10) }}
    >
      {children}
    </div>
  )
}

export function Legend({ items }: { items: { name: string; color: string; dashed?: boolean }[] }) {
  if (items.length < 2) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      {items.map((it) => (
        <li key={it.name} className="flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden>
            <line x1="0" y1="4" x2="16" y2="4" strokeWidth="2.5" strokeLinecap="round" style={{ stroke: it.color }} strokeDasharray={it.dashed ? '4 3' : undefined} />
          </svg>
          {it.name}
        </li>
      ))}
    </ul>
  )
}

const PAD = { l: 52, r: 16, t: 12, b: 28 }

function YAxis({ ticks, y, width, fmt }: { ticks: number[]; y: (v: number) => number; width: number; fmt: Fmt }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={width - PAD.r} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth="1" />
          <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-faint" style={{ fontSize: 11 }}>
            {formatValue(t, fmt)}
          </text>
        </g>
      ))}
    </g>
  )
}

export interface LineSeries {
  name: string
  color: string
  points: { date: string; value: number }[]
}
export interface Band {
  name: string
  points: { date: string; value: number; lo: number; hi: number }[]
  /** Points after this date are a forecast (drawn dashed). */
  forecastFrom?: string
}

/** Values over time: 2px lines, a recessive grid, a crosshair that reads every series at once. */
export function LineChart({ series, band, fmt, height = 320 }: { series: LineSeries[]; band?: Band; fmt: Fmt; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<string | null>(null)
  const dates = [...new Set([...series.flatMap((s) => s.points.map((p) => p.date)), ...(band?.points.map((p) => p.date) ?? [])])].sort()
  if (dates.length < 2) return <p className="py-10 text-center text-sm text-muted">Not enough dates to draw a trend.</p>
  const values = [...series.flatMap((s) => s.points.map((p) => p.value)), ...(band?.points.flatMap((p) => [p.lo, p.hi]) ?? [])]
  let lo = Math.min(...values)
  const hi = Math.max(...values)
  if (lo > 0 && lo < hi * 0.35) lo = 0
  const ticks = niceTicks(lo, hi)
  const y0 = ticks[0]
  const y1 = ticks.at(-1)!
  const t0 = ms(dates[0])
  const t1 = ms(dates.at(-1)!)
  const x = (d: string) => PAD.l + ((ms(d) - t0) / (t1 - t0 || 1)) * (width - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0 || 1)) * (height - PAD.t - PAD.b)
  const path = (pts: { date: string; value: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const xticks = Array.from({ length: Math.min(6, dates.length) }, (_, i) => dates[Math.round((i * (dates.length - 1)) / Math.max(1, Math.min(6, dates.length) - 1))])

  const hist = band?.forecastFrom ? band.points.filter((p) => p.date <= band.forecastFrom!) : band?.points
  const future = band?.forecastFrom ? band.points.filter((p) => p.date >= band.forecastFrom!) : []
  const area = band ? `${band.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p.hi)}`).join('')}${[...band.points].reverse().map((p) => `L${x(p.date)},${y(p.lo)}`).join('')}Z` : ''

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const t = t0 + ((e.clientX - r.left - PAD.l) / (width - PAD.l - PAD.r)) * (t1 - t0)
    let best = dates[0]
    for (const d of dates) if (Math.abs(ms(d) - t) < Math.abs(ms(best) - t)) best = d
    setHover(best)
  }

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`Line chart of ${series.map((s) => s.name).join(', ')}`}>
        <YAxis ticks={ticks} y={y} width={width} fmt={fmt} />
        {xticks.map((d) => (
          <text key={d} x={x(d)} y={height - 8} textAnchor="middle" className="fill-faint" style={{ fontSize: 11 }}>
            {dateLabel(d)}
          </text>
        ))}
        {band && <path d={area} style={{ fill: 'var(--ink)', opacity: 0.07 }} />}
        {series.map((s) => (
          <path key={s.name} d={path(s.points)} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: s.color }} />
        ))}
        {hist && <path d={path(hist)} fill="none" strokeWidth="2" className="stroke-ink" strokeLinecap="round" />}
        {future.length > 1 && <path d={path(future)} fill="none" strokeWidth="2" className="stroke-ink" strokeDasharray="5 4" strokeLinecap="round" />}
        {band?.forecastFrom && <line x1={x(band.forecastFrom)} x2={x(band.forecastFrom)} y1={PAD.t} y2={height - PAD.b} className="stroke-line" strokeWidth="1" />}
        {hover && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={height - PAD.b} className="stroke-faint" strokeWidth="1" />
            {series.map((s) => {
              const p = s.points.find((q) => q.date === hover)
              return p ? <circle key={s.name} cx={x(hover)} cy={y(p.value)} r="4.5" strokeWidth="2" className="stroke-surface" style={{ fill: s.color }} /> : null
            })}
          </g>
        )}
      </svg>
      {hover && (
        <Tip x={x(hover)} y={PAD.t} width={width}>
          <div className="mb-1 font-semibold">{dateLabel(hover, true)}</div>
          {series.map((s) => {
            const p = s.points.find((q) => q.date === hover)
            return p ? (
              <div key={s.name} className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 text-muted">{s.name}</span>
                <span className="font-semibold tabular">{formatValue(p.value, fmt)}</span>
              </div>
            ) : null
          })}
          {band &&
            (() => {
              const p = band.points.find((q) => q.date === hover)
              return p ? (
                <div className="mt-1 border-t border-line pt-1 text-muted">
                  {band.name}: <span className="font-semibold text-ink tabular">{formatValue(p.value, fmt)}</span>
                  <div className="text-[11px]">
                    likely {formatValue(p.lo, fmt)} to {formatValue(p.hi, fmt)}
                  </div>
                </div>
              ) : null
            })()}
        </Tip>
      )}
    </div>
  )
}

/** Comparing groups: horizontal bars (<= 24px), value at the tip, biggest first. */
export function BarChart({ rows, fmt }: { rows: { label: string; value: number; n: number }[]; fmt: Fmt }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-muted">Nothing to compare.</p>
  const labelW = Math.min(170, Math.max(70, Math.max(...rows.map((r) => r.label.length)) * 7 + 8))
  const valueW = 64
  const row = 32
  const height = rows.length * row + 8
  const max = Math.max(0, ...rows.map((r) => r.value))
  const min = Math.min(0, ...rows.map((r) => r.value))
  const plot = width - labelW - valueW
  const x = (v: number) => labelW + ((v - min) / (max - min || 1)) * plot
  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label="Bar chart">
        <line x1={x(0)} x2={x(0)} y1={0} y2={height} className="stroke-line" />
        {rows.map((r, i) => {
          const top = i * row + 6
          const a = x(Math.min(0, r.value))
          const b = x(Math.max(0, r.value))
          const w = Math.max(1, b - a)
          const rad = Math.min(4, w / 2)
          const pos = r.value >= 0
          const d = pos
            ? `M${a},${top} H${b - rad} Q${b},${top} ${b},${top + rad} V${top + 20 - rad} Q${b},${top + 20} ${b - rad},${top + 20} H${a} Z`
            : `M${b},${top} H${a + rad} Q${a},${top} ${a},${top + rad} V${top + 20 - rad} Q${a},${top + 20} ${a + rad},${top + 20} H${b} Z`
          return (
            <g key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={0} y={i * row} width={width} height={row} fill="transparent" />
              <text x={labelW - 10} y={top + 10} dy="0.32em" textAnchor="end" className="fill-muted" style={{ fontSize: 12 }}>
                {r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label}
              </text>
              <path d={d} style={{ fill: 'var(--s1)', opacity: hover === null || hover === i ? 1 : 0.45 }} />
              <text x={(pos ? b : a) + (pos ? 6 : -6)} y={top + 10} dy="0.32em" textAnchor={pos ? 'start' : 'end'} className="fill-ink" style={{ fontSize: 12, fontWeight: 600 }}>
                {formatValue(r.value, fmt)}
              </text>
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <Tip x={x(rows[hover].value)} y={hover * row} width={width}>
          <div className="font-semibold">{rows[hover].label}</div>
          <div className="text-muted">
            {formatValue(rows[hover].value, fmt)} from {rows[hover].n.toLocaleString()} rows
          </div>
        </Tip>
      )}
    </div>
  )
}

export interface Dot {
  x: number
  y: number
  group?: string
}

/** Relationship between two numbers, with the fitted line, its 95% band and an optional "what if" marker. */
export function ScatterChart({
  dots,
  groups,
  line,
  marker,
  fmtX,
  fmtY,
  labelX,
  labelY,
  height = 340,
}: {
  dots: Dot[]
  groups: { name: string; color: string }[]
  line?: { at: (x: number) => number; band: (x: number) => [number, number] }
  marker?: { x: number; y: number; lo: number; hi: number }
  fmtX: Fmt
  fmtY: Fmt
  labelX: string
  labelY: string
  height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  if (dots.length < 2) return <p className="py-10 text-center text-sm text-muted">Not enough rows with both numbers.</p>
  const xs = dots.map((d) => d.x).concat(marker ? [marker.x] : [])
  const ys = dots.map((d) => d.y).concat(marker ? [marker.lo, marker.hi] : [])
  const xt = niceTicks(Math.min(...xs), Math.max(...xs))
  const yt = niceTicks(Math.min(...ys), Math.max(...ys))
  const pb = PAD.b + 14
  const x = (v: number) => PAD.l + ((v - xt[0]) / (xt.at(-1)! - xt[0] || 1)) * (width - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - yt[0]) / (yt.at(-1)! - yt[0] || 1)) * (height - PAD.t - pb)
  const color = (g?: string) => groups.find((q) => q.name === g)?.color ?? groups[0]?.color ?? SERIES[0]
  const steps = 40
  const lx = Array.from({ length: steps + 1 }, (_, i) => xt[0] + ((xt.at(-1)! - xt[0]) * i) / steps)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    let best = -1
    let bd = 18 * 18
    dots.forEach((d, i) => {
      const dd = (x(d.x) - mx) ** 2 + (y(d.y) - my) ** 2
      if (dd < bd) {
        bd = dd
        best = i
      }
    })
    setHover(best >= 0 ? best : null)
  }

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${labelY} against ${labelX}`}>
        <YAxis ticks={yt} y={y} width={width} fmt={fmtY} />
        {xt.map((t) => (
          <text key={t} x={x(t)} y={height - pb + 16} textAnchor="middle" className="fill-faint" style={{ fontSize: 11 }}>
            {formatValue(t, fmtX)}
          </text>
        ))}
        <text x={(PAD.l + width - PAD.r) / 2} y={height - 4} textAnchor="middle" className="fill-muted" style={{ fontSize: 11.5, fontWeight: 600 }}>
          {labelX}
        </text>
        {line && (
          <>
            <path
              d={`${lx.map((v, i) => `${i ? 'L' : 'M'}${x(v)},${y(line.band(v)[1])}`).join('')}${[...lx].reverse().map((v) => `L${x(v)},${y(line.band(v)[0])}`).join('')}Z`}
              style={{ fill: 'var(--ink)', opacity: 0.07 }}
            />
          </>
        )}
        {dots.map((d, i) => (
          <circle key={i} cx={x(d.x)} cy={y(d.y)} r={hover === i ? 5.5 : 4} strokeWidth="1.5" className="stroke-surface" style={{ fill: color(d.group), opacity: 0.8 }} />
        ))}
        {line && <line x1={x(xt[0])} y1={y(line.at(xt[0]))} x2={x(xt.at(-1)!)} y2={y(line.at(xt.at(-1)!))} strokeWidth="2" className="stroke-ink" strokeLinecap="round" />}
        {marker && (
          <g>
            <line x1={x(marker.x)} x2={x(marker.x)} y1={y(marker.lo)} y2={y(marker.hi)} className="stroke-ink" strokeWidth="2" strokeLinecap="round" />
            <circle cx={x(marker.x)} cy={y(marker.y)} r="8" strokeWidth="3" className="stroke-surface" style={{ fill: 'var(--pop)' }} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <Tip x={x(dots[hover].x)} y={y(dots[hover].y)} width={width}>
          {dots[hover].group && <div className="font-semibold">{dots[hover].group}</div>}
          <div className="text-muted">
            {labelX}: <span className="font-semibold text-ink tabular">{formatValue(dots[hover].x, fmtX)}</span>
          </div>
          <div className="text-muted">
            {labelY}: <span className="font-semibold text-ink tabular">{formatValue(dots[hover].y, fmtY)}</span>
          </div>
        </Tip>
      )}
    </div>
  )
}

/** How values spread: columns with a 2px gap, plus the average and the middle value marked. */
export function Histogram({ values, bins = 20, fmt, marks }: { values: number[]; bins?: number; fmt: Fmt; marks: { name: string; value: number }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 300
  if (values.length < 2) return <p className="py-10 text-center text-sm text-muted">Not enough values.</p>
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const w = (hi - lo || 1) / bins
  const counts = new Array(bins).fill(0)
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++
  const yt = niceTicks(0, Math.max(...counts))
  const x = (v: number) => PAD.l + ((v - lo) / (hi - lo || 1)) * (width - PAD.l - PAD.r)
  const y = (c: number) => PAD.t + (1 - c / (yt.at(-1)! || 1)) * (height - PAD.t - PAD.b)
  const xt = niceTicks(lo, hi).filter((t) => t >= lo && t <= hi)
  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label="Histogram">
        <YAxis ticks={yt} y={y} width={width} fmt="number" />
        {xt.map((t) => (
          <text key={t} x={x(t)} y={height - 8} textAnchor="middle" className="fill-faint" style={{ fontSize: 11 }}>
            {formatValue(t, fmt)}
          </text>
        ))}
        {counts.map((c, i) => {
          const a = x(lo + i * w) + 1
          const b = x(lo + (i + 1) * w) - 1
          const top = y(c)
          const base = y(0)
          const rad = Math.min(4, (b - a) / 2, base - top)
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={a - 1} y={PAD.t} width={b - a + 2} height={base - PAD.t} fill="transparent" />
              {c > 0 && (
                <path
                  d={`M${a},${base} V${top + rad} Q${a},${top} ${a + rad},${top} H${b - rad} Q${b},${top} ${b},${top + rad} V${base} Z`}
                  style={{ fill: 'var(--s1)', opacity: hover === null || hover === i ? 1 : 0.5 }}
                />
              )}
            </g>
          )
        })}
        {marks.map((m, i) => (
          <g key={m.name}>
            <line x1={x(m.value)} x2={x(m.value)} y1={PAD.t + 14 * (i + 1)} y2={height - PAD.b} className="stroke-ink" strokeWidth="1.5" />
            <text x={x(m.value) + 4} y={PAD.t + 14 * (i + 1) + 4} className="fill-ink" style={{ fontSize: 11, fontWeight: 600 }}>
              {m.name} {formatValue(m.value, fmt)}
            </text>
          </g>
        ))}
      </svg>
      {hover !== null && (
        <Tip x={x(lo + hover * w)} y={y(counts[hover])} width={width}>
          <div className="font-semibold">
            {formatValue(lo + hover * w, fmt)} to {formatValue(lo + (hover + 1) * w, fmt)}
          </div>
          <div className="text-muted">{counts[hover].toLocaleString()} rows</div>
        </Tip>
      )}
    </div>
  )
}
