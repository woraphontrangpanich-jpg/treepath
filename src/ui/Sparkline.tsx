import type { SeriesPoint } from '../data/types'

export function Sparkline({ points, width = 96, height = 24, className = 'stroke-accent' }: { points: SeriesPoint[]; width?: number; height?: number; className?: string }) {
  if (points.length < 2) return <span className="text-xs text-faint">—</span>
  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    if (p.value < min) min = p.value
    if (p.value > max) max = p.value
  }
  const span = max - min || 1
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width
      const y = height - 2 - ((p.value - min) / span) * (height - 4)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join('')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <path d={d} fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" className={className} />
    </svg>
  )
}
