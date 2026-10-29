import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { clsx } from 'clsx'
import { AlertCircle } from 'lucide-react'
import { memo, type CSSProperties } from 'react'
import { formatChange, formatValue } from '../../lib/format'
import type { NodeResult } from '../../model/scenario'
import type { NodeSeries, NodeSummary } from '../../tree/compute'
import type { NodeKind, TreeNode } from '../../tree/types'
import { Sparkline } from '../Sparkline'

export type CardData = {
  node: TreeNode
  kind: NodeKind
  series?: NodeSeries
  summary: NodeSummary
  isOutcome: boolean
  issue?: string
  source?: string
  /** Present in Forecast mode. */
  scenario?: NodeResult
  /** Forecast mode: card is off the changed path. */
  dimmed?: boolean
  /** Forecast mode: when the pulse reaches this card (ms), and a key that restarts it on each change. */
  pulseDelay?: number
  pulseKey?: string
}

export type CardNode = Node<CardData, 'card'>

function CardImpl({ data, selected }: NodeProps<CardNode>) {
  const { node, kind, series, summary, isOutcome, issue, source, scenario, dimmed, pulseDelay, pulseKey } = data
  const change = formatChange(summary.change)
  const fmt = series?.format
  const moved = !!scenario?.affected
  const up = (scenario?.delta ?? 0) > 0
  const tone = up ? '--up' : '--down'
  // Tint grows with the size of the move, so the eye goes to what changed most.
  const strength = moved ? Math.min(34, 10 + Math.abs(scenario!.pct ?? 0.05) * 100 * 2.2) : 0

  const style: CSSProperties = {}
  if (moved && !isOutcome) {
    style.background = `color-mix(in srgb, var(${tone}) ${strength}%, var(--surface))`
    style.borderColor = `color-mix(in srgb, var(${tone}) 55%, var(--line))`
  }
  if (moved) {
    ;(style as Record<string, string>)['--pulse'] = `var(${tone})`
    style.animationDelay = `${pulseDelay ?? 0}ms`
  }

  const value = scenario ? scenario.value : summary.latest?.value

  return (
    <div
      key={pulseKey}
      className={clsx(
        'w-[236px] border text-left',
        isOutcome
          ? 'rounded-[18px] border-ink bg-ink text-bg shadow-[0_18px_40px_-22px_rgb(23_35_56/0.65)]'
          : kind === 'formula'
            ? 'rounded-md border-formula/35 border-t-[3px] border-t-formula bg-surface shadow-[0_1px_0_rgb(23_35_56/0.04)]'
            : 'rounded-xl border-line bg-surface shadow-[0_1px_0_rgb(23_35_56/0.04)]',
        selected && 'outline-2 outline-offset-[3px] outline-accent',
        issue && !scenario && !isOutcome && 'border-down/60',
        dimmed && 'opacity-35',
        moved && 'node-arrive',
      )}
      style={style}
    >
      <Handle type="target" position={Position.Bottom} />
      <div className="px-3.5 pt-3 pb-3">
        <div className="flex items-center gap-2">
          {kind === 'formula' && (
            <span className="text-[13px] font-semibold text-formula italic" aria-label="Formula">
              ƒ
            </span>
          )}
          <div className="min-w-0 flex-1 truncate text-[14px] leading-snug font-semibold" title={node.label}>
            {node.label || <span className="opacity-50">Unnamed</span>}
          </div>
          {isOutcome && <span className="rounded-full bg-bg/15 px-2 py-0.5 text-[10.5px] font-medium">Outcome</span>}
          {issue && (
            <span className="text-down" title={issue} role="img" aria-label={`Problem: ${issue}`}>
              <AlertCircle className="size-3.5" />
            </span>
          )}
        </div>

        {series?.error ? (
          <p className="mt-2 text-xs text-down">{series.error}</p>
        ) : (
          <>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className={clsx('font-display leading-none', isOutcome ? 'text-[28px]' : 'text-[21px]')}>{formatValue(value, fmt)}</span>
              {scenario
                ? moved && (
                    <span
                      className={clsx(
                        'text-[12px] font-semibold tabular',
                        isOutcome ? clsx('rounded-full px-2 py-0.5 text-white', up ? 'bg-up' : 'bg-down') : up ? 'text-up' : 'text-down',
                      )}
                    >
                      {formatChange(scenario.pct) ?? ''}
                    </span>
                  )
                : change && (
                    <span className={clsx('text-[12px] tabular', isOutcome ? 'text-bg/70' : (summary.change ?? 0) >= 0 ? 'text-up' : 'text-down')}>
                      {change}
                    </span>
                  )}
            </div>
            {scenario ? (
              <p className={clsx('mt-1.5 text-[11.5px] tabular', isOutcome ? 'text-bg/70' : 'text-muted')}>
                {moved
                  ? `was ${formatValue(scenario.base, fmt)}, ${scenario.how === 'input' ? 'your change' : scenario.how === 'model' ? 'learned effect' : 'by formula'}`
                  : 'unchanged'}
              </p>
            ) : (
              <div className={clsx('mt-2', isOutcome && 'opacity-90')}>
                <Sparkline points={series?.points.slice(-90) ?? []} width={206} height={24} className={isOutcome ? 'stroke-bg/80' : 'stroke-accent'} />
              </div>
            )}
          </>
        )}

        {kind === 'formula' && !scenario && (
          <p className={clsx('mt-2 line-clamp-2 font-mono text-[10.5px] leading-4', isOutcome ? 'text-bg/60' : 'text-muted')} title={node.formula}>
            = {node.formula || '…'}
          </p>
        )}
        {source && !scenario && <p className="mt-1.5 truncate text-[11px] text-faint">{source}</p>}
        {!scenario && summary.gap !== null && Math.abs(summary.gap) > 1e-9 && (
          <p className={clsx('mt-0.5 text-[11px] tabular', isOutcome ? 'text-bg/60' : 'text-faint')}>
            {formatValue(Math.abs(summary.gap), fmt)} {summary.gap > 0 ? 'above' : 'below'} reported
          </p>
        )}
      </div>
      <Handle type="source" position={Position.Top} />
    </div>
  )
}

export const NodeCard = memo(CardImpl)
