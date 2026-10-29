import { quantile, tPValue } from './stats'

/** Approximate two-sided 95% t critical value (within ~1% for df >= 3). */
export function tCrit95(df: number) {
  if (df <= 0) return NaN
  if (df === 1) return 12.71
  if (df === 2) return 4.3
  return 1.96 + 2.5 / df + 3 / (df * df)
}

export interface LinearFit {
  n: number
  slope: number
  intercept: number
  r: number
  r2: number
  /** p-value for "the slope is really zero". */
  p: number
  /** Residual standard error. */
  s: number
  xMean: number
  sxx: number
  predict: (x: number) => number
  /** 95% band: `mean` for where the average sits, `point` for where a single new value may land. */
  interval: (x: number, kind: 'mean' | 'point') => [number, number]
}

/** Ordinary least squares on one input: y = intercept + slope · x. */
export function linearFit(xs: number[], ys: number[]): LinearFit | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
  }
  const xMean = sx / n
  const yMean = sy / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean
    const dy = ys[i] - yMean
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  const intercept = yMean - slope * xMean
  const sse = Math.max(0, syy - slope * sxy)
  const s = Math.sqrt(sse / Math.max(1, n - 2))
  const r = syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy)
  const se = s / Math.sqrt(sxx)
  const p = se === 0 ? 0 : tPValue(slope / se, n - 2)
  const t = tCrit95(n - 2)
  const predict = (x: number) => intercept + slope * x
  return {
    n,
    slope,
    intercept,
    r,
    r2: r * r,
    p,
    s,
    xMean,
    sxx,
    predict,
    interval: (x, kind) => {
      const half = t * s * Math.sqrt((kind === 'point' ? 1 : 0) + 1 / n + ((x - xMean) * (x - xMean)) / sxx)
      const y = predict(x)
      return [y - half, y + half]
    },
  }
}

/** Plain-words strength for |r|. */
export function strength(r: number) {
  const a = Math.abs(r)
  return a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'very weak'
}

export interface Summary {
  count: number
  mean: number
  median: number
  std: number
  min: number
  max: number
  q1: number
  q3: number
}

export function summarize(values: number[]): Summary | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return null
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  const std = Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, v.length - 1))
  return { count: v.length, mean, median: quantile(v, 0.5), std, min: v[0], max: v[v.length - 1], q1: quantile(v, 0.25), q3: quantile(v, 0.75) }
}

/** Trailing moving average; the first `k - 1` points average what's available. */
export function movingAverage(values: number[], k: number) {
  const out: number[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= k) sum -= values[i - k]
    out.push(sum / Math.min(i + 1, k))
  }
  return out
}
