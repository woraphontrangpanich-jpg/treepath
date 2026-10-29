import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { clsx } from 'clsx'
import { memo } from 'react'
import { ROLES } from '../../tree/roles'
import type { TreeEdge } from '../../tree/types'

export type RoleEdgeData = { edge: TreeEdge; dimmed?: boolean }
export type RoleFlowEdge = Edge<RoleEdgeData, 'role'>

function RoleEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<RoleFlowEdge>) {
  const e = data!.edge
  const meta = ROLES[e.role]
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.35 })
  const label =
    e.role === 'driver'
      ? `model${e.lag ? ` · lag ${e.lag}` : ''}${e.expectedSign === 'negative' ? ' · −' : e.expectedSign === 'positive' ? ' · +' : ''}`
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
          stroke: meta.color,
          strokeWidth: selected ? 3 : 1.75,
          strokeDasharray: meta.dash,
          opacity: data?.dimmed ? 0.25 : 1,
        }}
      />
      {/* Arrowhead pointing into the bottom of the target card. */}
      <path
        d={`M ${targetX - 4.5} ${targetY + 8} L ${targetX} ${targetY + 1} L ${targetX + 4.5} ${targetY + 8} Z`}
        style={{ fill: meta.color, opacity: data?.dimmed ? 0.25 : 1 }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className={clsx(
              'nodrag nopan pointer-events-auto absolute rounded-md border bg-surface px-1.5 py-px font-mono text-[10px] leading-4',
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
