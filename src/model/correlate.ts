import type { SeriesPoint } from '../data/types'
import type { TreeSeries } from '../tree/compute'
import type { NodeFormat, Tree } from '../tree/types'
import { chooseTransform, fwd } from './drivers'
import { corrPValue, correlation } from './stats'

export interface Correlation {
  nodeId: string
  label: string
  /** Pearson r of period-over-period changes (same scale the models use). */
  r: number
  p: number
  n: number
}

/** Period-over-period change on the card's model scale, keyed by date. */
function changes(points: SeriesPoint[], format: NodeFormat): Map<string, number> {
  const tf = chooseTransform(points, format)
  const out = new Map<string, number>()
  for (let i = 1; i < points.length; i++) {
    const d = fwd(tf, points[i].value) - fwd(tf, points[i - 1].value)
    if (Number.isFinite(d)) out.set(points[i].date, d)
  }
  return out
}

/**
 * How strongly every other card moves with the selected one. Changes, not levels, so two
 * series that both just trend upward don't look related.
 */
export function correlationsWith(tree: Tree, series: TreeSeries, nodeId: string): Correlation[] {
  const base = series.byNode.get(nodeId)
  if (!base || base.points.length < 5) return []
  const a = changes(base.points, base.format)
  const out: Correlation[] = []
  for (const n of tree.nodes) {
    if (n.id === nodeId) continue
    const s = series.byNode.get(n.id)
    if (!s || s.points.length < 5) continue
    const b = changes(s.points, s.format)
    const xs: number[] = []
    const ys: number[] = []
    for (const [date, v] of a) {
      const w = b.get(date)
      if (w !== undefined) {
        xs.push(v)
        ys.push(w)
      }
    }
    const r = correlation(xs, ys)
    if (Number.isFinite(r)) out.push({ nodeId: n.id, label: n.label, r, p: corrPValue(r, xs.length), n: xs.length })
  }
  return out.sort((x, y) => Math.abs(y.r) - Math.abs(x.r))
}

export function strengthLabel(r: number) {
  const a = Math.abs(r)
  if (a >= 0.7) return 'strong'
  if (a >= 0.4) return 'moderate'
  if (a >= 0.2) return 'weak'
  return 'none'
}
