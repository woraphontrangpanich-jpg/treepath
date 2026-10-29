import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { clsx } from 'clsx'
import { AlertCircle, ChevronDown, Table2 } from 'lucide-react'
import { memo, type CSSProperties, type ReactNode } from 'react'
import { formatChange, formatValue } from '../../lib/format'
import type { DriverFit } from '../../model/drivers'
import type { NodeResult } from '../../model/scenario'
import { useTrees } from '../../state/trees'
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
  model?: DriverFit
  /** Correlation with the selected card (Build mode). */
  corr?: { r: number; p: number }
  /** Present in Forecast mode. */
  scenario?: NodeResult
  /** Forecast mode: card is off the changed path. */
  dimmed?: boolean
  /** Forecast mode: when the pulse reaches this card (ms), and a key that restarts it on each change. */
  pulseDelay?: number
  pulseKey?: string
}

export type CardNode = Node<CardData, 'card'>

function CorrChip({ r, p, dark }: { r: number; p: number; dark?: boolean }) {
  const a = Math.abs(r)
  const significant = p < 0.05
  return (
    <span
      title={`Correlation of changes with the selected card: r = ${r.toFixed(2)}, p = ${p < 0.001 ? '<0.001' : p.toFixed(3)}`}
      className={clsx(
        'rounded-full px-2 py-0.5 text-[11px] font-semibold tabular',
        !significant ? (dark ? 'bg-bg/15 text-bg/60' : 'bg-surface-2 text-faint ring-1 ring-line') : r > 0 ? 'bg-up text-white' : 'bg-down text-white',
      )}
      style={significant ? { opacity: 0.55 + Math.min(0.45, a) } : undefined}
    >
      r {r >= 0 ? '+' : '−'}
      {a.toFixed(2)}
    </span>
  )
}

function Detail({ label, children, dark }: { label: string; children: ReactNode; dark?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[11.5px]">
      <dt className={dark ? 'text-bg/60' : 'text-muted'}>{label}</dt>
      <dd className="min-w-0 truncate text-right tabular">{children}</dd>
    </div>
  )
}

function Details({ data }: { data: CardData }) {
  const { node, kind, series, summary, source, model, isOutcome } = data
  const fmt = series?.format
  const pts = series?.points ?? []
  const values = pts.map((p) => p.value)
  const dark = isOutcome
  return (
    <dl className={clsx('mt-2.5 border-t pt-2', dark ? 'border-bg/15' : kind === 'formula' ? 'border-formula/25' : 'border-line')}>
      {source && (
        <Detail label="Source" dark={dark}>
          {source}
        </Detail>
      )}
      <Detail label="Average, last 28" dark={dark}>
        {formatValue(summary.recentMean, fmt)}
      </Detail>
      {values.length > 0 && (
        <Detail label="Range" dark={dark}>
          {formatValue(Math.min(...values), fmt)} to {formatValue(Math.max(...values), fmt)}
        </Detail>
      )}
      {pts.length > 0 && (
        <Detail label="History" dark={dark}>
          {pts[0].date} to {pts.at(-1)!.date}
        </Detail>
      )}
      {series?.panel && (
        <Detail label="Per key" dark={dark}>
          {series.panel.size} keys{series.unmatchedRows ? `, ${series.unmatchedRows} rows unmatched` : ''}
        </Detail>
      )}
      {summary.gap !== null && Math.abs(summary.gap) > 1e-9 && (
        <Detail label="vs reported" dark={dark}>
          {summary.gap > 0 ? '+' : '−'}
          {formatValue(Math.abs(summary.gap), fmt)}
        </Detail>
      )}
      {model?.ok && (
        <Detail label="Learned fit" dark={dark}>
          R² {(model.r2 * 100).toFixed(0)}%, F p {model.fP < 0.001 ? '<0.001' : model.fP.toFixed(3)}
        </Detail>
      )}
      {kind === 'formula' && isOutcome && node.formula && (
        <p className={clsx('mt-1.5 font-mono text-[10.5px] leading-4 break-words', dark ? 'text-bg/70' : 'text-formula')}>= {node.formula}</p>
      )}
    </dl>
  )
}

function CardImpl({ id, data, selected }: NodeProps<CardNode>) {
  const { node, kind, series, summary, isOutcome, issue, source, scenario, dimmed, pulseDelay, pulseKey, corr } = data
  const open = useTrees((s) => s.details[id] ?? s.detailsAll)
  const toggleDetails = useTrees((s) => s.toggleDetails)
  const change = formatChange(summary.change)
  const fmt = series?.format
  const moved = !!scenario?.affected
  const up = (scenario?.delta ?? 0) > 0
  const tone = up ? '--up' : '--down'
  const strength = moved ? Math.min(34, 10 + Math.abs(scenario!.pct ?? 0.05) * 100 * 2.2) : 0
  const isFormula = kind === 'formula'

  const style: CSSProperties = {}
  if (moved && !isOutcome) {
    style.background = `color-mix(in srgb, var(${tone}) ${strength}%, var(${isFormula ? '--formula-soft' : '--surface'}))`
    style.borderColor = `color-mix(in srgb, var(${tone}) 55%, var(--line))`
  }
  if (moved) {
    ;(style as Record<string, string>)['--pulse'] = `var(${tone})`
    style.animationDelay = `${pulseDelay ?? 0}ms`
  }
  const value = scenario ? scenario.value : summary.latest?.value

  const body = (
    <div className={clsx('min-w-0 flex-1 pt-2.5 pb-3', isFormula && !isOutcome ? 'pr-3.5 pl-3' : 'px-3.5')}>
      <div className="flex items-center gap-2">
        {!isFormula && !isOutcome && <Table2 className="size-3.5 shrink-0 text-accent" aria-label="Data from a file" />}
        {isFormula && isOutcome && (
          <span className="text-[13px] font-semibold text-formula italic" aria-label="Formula">
            ƒ
          </span>
        )}
        <div className="min-w-0 flex-1 truncate text-[14px] leading-snug font-semibold" title={node.label}>
          {node.label || <span className="opacity-50">Unnamed</span>}
        </div>
        {corr && <CorrChip r={corr.r} p={corr.p} dark={isOutcome} />}
        {isOutcome && !corr && <span className="rounded-full bg-bg/15 px-2 py-0.5 text-[10.5px] font-medium">Outcome</span>}
        {issue && (
          <span className="text-down" title={issue} role="img" aria-label={`Problem: ${issue}`}>
            <AlertCircle className="size-3.5" />
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggleDetails(id)
          }}
          aria-expanded={open}
          aria-label={open ? `Hide details for ${node.label}` : `Show details for ${node.label}`}
          className={clsx('nodrag press -mr-1 grid size-6 place-items-center rounded-full', isOutcome ? 'hover:bg-bg/15' : 'hover:bg-surface-2')}
        >
          <ChevronDown className={clsx('size-3.5 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      </div>

      {series?.error ? (
        <p className="mt-2 text-xs text-down">{series.error}</p>
      ) : (
        <>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            {isFormula && <span className={clsx('font-display text-[17px] leading-none', isOutcome ? 'text-bg/50' : 'text-formula')}>=</span>}
            <span className={clsx('font-display leading-none', isOutcome ? 'text-[28px]' : 'text-[21px]')}>{formatValue(value, fmt)}</span>
            {scenario
              ? moved && (
                  <span
                    className={clsx(
                      'ml-0.5 text-[12px] font-semibold tabular',
                      isOutcome ? clsx('rounded-full px-2 py-0.5 text-white', up ? 'bg-up' : 'bg-down') : up ? 'text-up' : 'text-down',
                    )}
                  >
                    {formatChange(scenario.pct) ?? ''}
                  </span>
                )
              : change && (
                  <span className={clsx('ml-0.5 text-[12px] tabular', isOutcome ? 'text-bg/70' : (summary.change ?? 0) >= 0 ? 'text-up' : 'text-down')}>
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
          ) : isFormula && !isOutcome ? (
            // Formula cards show their maths instead of a trend line.
            <p className="mt-2 line-clamp-2 rounded-md bg-surface/70 px-2 py-1 font-mono text-[10.5px] leading-4 text-formula" title={node.formula}>
              {node.formula || 'write a formula…'}
            </p>
          ) : (
            <div className={clsx('mt-2', isOutcome && 'opacity-90')}>
              <Sparkline points={series?.points.slice(-90) ?? []} width={isFormula ? 200 : 206} height={24} className={isOutcome ? 'stroke-bg/80' : 'stroke-accent'} />
            </div>
          )}
        </>
      )}

      {!scenario && !open && source && !isFormula && <p className="mt-1.5 truncate text-[11px] text-faint">{source}</p>}
      {open && <Details data={data} />}
    </div>
  )

  return (
    <div
      key={pulseKey}
      className={clsx(
        'w-[248px] border text-left',
        isOutcome
          ? 'rounded-[18px] border-ink bg-ink text-bg shadow-[0_18px_40px_-22px_rgb(23_35_56/0.65)]'
          : isFormula
            ? 'flex overflow-hidden rounded-lg border-formula/60 bg-formula-soft shadow-[0_6px_16px_-12px_rgb(167_104_16/0.6)]'
            : 'rounded-xl border-line bg-surface shadow-[0_1px_0_rgb(23_35_56/0.04)]',
        selected && 'outline-2 outline-offset-[3px] outline-accent',
        issue && !scenario && !isOutcome && 'border-down/60',
        dimmed && 'opacity-35',
        moved && 'node-arrive',
      )}
      style={style}
    >
      <Handle type="target" position={Position.Bottom} />
      {isFormula && !isOutcome && (
        // A solid ochre band: formula cards are calculated, never read from a file.
        <div className="flex w-7 shrink-0 items-start justify-center bg-formula pt-2.5" aria-hidden>
          <span className="font-display text-[15px] text-white italic">ƒ</span>
        </div>
      )}
      {body}
      <Handle type="source" position={Position.Top} />
    </div>
  )
}

export const NodeCard = memo(CardImpl)
