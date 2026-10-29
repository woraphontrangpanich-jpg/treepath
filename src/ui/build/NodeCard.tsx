import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { clsx } from 'clsx'
import { AlertCircle, Sigma, StickyNote, Target } from 'lucide-react'
import { memo } from 'react'
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
  /** Present in Scenario mode. */
  scenario?: NodeResult
  /** Scenario mode: card is off the changed path. */
  dimmed?: boolean
}

export type CardNode = Node<CardData, 'card'>

function CardImpl({ data, selected }: NodeProps<CardNode>) {
  const { node, kind, series, summary, isOutcome, issue, source, scenario, dimmed } = data
  const change = formatChange(summary.change)
  const fmt = series?.format
  const moved = scenario?.affected
  const up = (scenario?.delta ?? 0) > 0
  // Stronger tint for bigger relative moves.
  const strength = moved ? Math.min(30, 8 + Math.abs(scenario!.pct ?? 0.05) * 100 * 2) : 0
  const tint = moved
    ? {
        background: `color-mix(in srgb, var(${up ? '--up' : '--down'}) ${strength}%, var(--surface))`,
        borderColor: `color-mix(in srgb, var(${up ? '--up' : '--down'}) 60%, var(--line))`,
      }
    : undefined

  return (
    <div
      className={clsx(
        'w-[236px] rounded-xl border bg-surface text-left shadow-sm transition-shadow',
        kind === 'formula' && 'border-formula/40 bg-formula-soft/40',
        kind === 'note' && 'border-dashed border-line bg-surface-2',
        kind === 'metric' && 'border-line',
        isOutcome && 'ring-2 ring-accent ring-offset-2 ring-offset-bg',
        selected && 'shadow-lg outline-2 outline-offset-2 outline-ink/60',
        issue && !scenario && 'border-down/60',
        dimmed && 'opacity-40',
      )}
      style={tint}
    >
      <Handle type="target" position={Position.Bottom} />
      <div className="px-3 pt-2.5 pb-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase">
          {isOutcome && (
            <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-accent-ink">
              <Target className="size-3" />
              Outcome
            </span>
          )}
          {kind === 'formula' && (
            <span className="inline-flex items-center gap-1 text-formula">
              <Sigma className="size-3" />
              Formula
            </span>
          )}
          {kind === 'metric' && <span className="text-faint">Metric</span>}
          {kind === 'note' && (
            <span className="inline-flex items-center gap-1 text-faint">
              <StickyNote className="size-3" />
              Note
            </span>
          )}
          {issue && (
            <span className="ml-auto text-down" title={issue}>
              <AlertCircle className="size-3.5" />
            </span>
          )}
        </div>
        <div className="mt-1 truncate text-[15px] leading-snug font-semibold" title={node.label}>
          {node.label || <span className="text-faint">Unnamed</span>}
        </div>

        {kind === 'note' ? (
          <p className="mt-1 line-clamp-4 text-xs text-muted">{node.note || 'Add context in the inspector.'}</p>
        ) : series?.error ? (
          <p className="mt-2 text-xs text-down">{series.error}</p>
        ) : scenario ? (
          <div className="mt-1">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xl font-medium tabular">{formatValue(scenario.value, fmt)}</span>
              {moved && (
                <span className={clsx('font-mono text-xs font-medium tabular', up ? 'text-up' : 'text-down')}>
                  {formatChange(scenario.pct) ?? (up ? '+' : '')}
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted tabular">
              {moved ? (
                <>
                  baseline {formatValue(scenario.base, fmt)} · {scenario.delta > 0 ? '+' : ''}
                  {formatValue(scenario.delta, fmt)}
                </>
              ) : (
                'unchanged'
              )}
            </div>
            {moved && scenario.how !== 'unchanged' && (
              <div className="mt-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                {scenario.how === 'input' ? 'your change' : scenario.how === 'model' ? 'model estimate' : 'formula'}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-xl font-medium tabular">{formatValue(summary.latest?.value, fmt)}</span>
              {change && (
                <span className={clsx('font-mono text-xs tabular', (summary.change ?? 0) >= 0 ? 'text-up' : 'text-down')}>{change}</span>
              )}
              <span className="ml-auto text-[10px] text-faint tabular">{summary.latest?.date}</span>
            </div>
            <div className="mt-1.5">
              <Sparkline points={series?.points.slice(-90) ?? []} width={210} height={26} />
            </div>
          </>
        )}

        {kind === 'formula' && (
          <p className="mt-2 line-clamp-2 font-mono text-[10.5px] leading-4 text-muted" title={node.formula}>
            = {node.formula || '…'}
          </p>
        )}
        {source && <p className="mt-1.5 truncate text-[10.5px] text-faint">{source}</p>}
        {summary.gap !== null && Math.abs(summary.gap) > 1e-9 && (
          <p className="mt-0.5 text-[10.5px] text-faint tabular">gap vs actual {formatValue(summary.gap, fmt)}</p>
        )}
      </div>
      <Handle type="source" position={Position.Top} />
    </div>
  )
}

export const NodeCard = memo(CardImpl)
