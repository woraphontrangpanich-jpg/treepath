import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { clsx } from 'clsx'
import { memo } from 'react'
import { ROLES } from '../../tree/roles'
import type { TreeEdge } from '../../tree/types'

export type RoleEdgeData = {
  edge: TreeEdge
  dimmed?: boolean
  /** Forecast mode: this link carries the change; tone, start delay (ms) and a key that restarts the pulse. */
  flow?: { tone: 'up' | 'down'; delay: number; key: string }
}
export type RoleFlowEdge = Edge<RoleEdgeData, 'role'>

function RoleEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<RoleFlowEdge>) {
  const e = data!.edge
  const meta = ROLES[e.role]
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.35 })
  const label =
    e.role === 'driver'
      ? `learned${e.lag ? `, lag ${e.lag}` : ''}`
      : e.role === 'formula' || e.role === 'cost'
        ? null
        : meta.short

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={16}
        style={{
          stroke: data?.flow ? `var(--${data.flow.tone})` : meta.color,
          strokeWidth: selected ? 3 : data?.flow ? 2.25 : 1.75,
          strokeDasharray: data?.flow ? undefined : meta.dash,
          opacity: data?.dimmed ? 0.18 : 1,
        }}
      />
      {data?.flow && (
        <path
          key={data.flow.key}
          d={path}
          fill="none"
          className="edge-flow"
          strokeLinecap="round"
          style={{ stroke: 'var(--surface)', strokeWidth: 2.25, opacity: 0.85, animationDelay: `${data.flow.delay}ms` }}
        />
      )}
      {/* Arrowhead pointing into the bottom of the target card. */}
      <path
        d={`M ${targetX - 4.5} ${targetY + 8} L ${targetX} ${targetY + 1} L ${targetX + 4.5} ${targetY + 8} Z`}
        style={{ fill: data?.flow ? `var(--${data.flow.tone})` : meta.color, opacity: data?.dimmed ? 0.18 : 1 }}
      />
      {label && !data?.flow && !data?.dimmed && (
        <EdgeLabelRenderer>
          <div
            className={clsx(
              'nodrag nopan pointer-events-auto absolute rounded-full border bg-surface px-2 py-px text-[10.5px] leading-4 font-medium',
              selected ? 'border-ink/50' : 'border-line',
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, color: meta.color }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const RoleEdge = memo(RoleEdgeImpl)
