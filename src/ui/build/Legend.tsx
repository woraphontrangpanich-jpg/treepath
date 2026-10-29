import { X } from 'lucide-react'
import { ROLE_ORDER, ROLES } from '../../tree/roles'
import { useTrees } from '../../state/trees'

export function Legend() {
  const show = useTrees((s) => s.showLegend)
  const toggle = useTrees((s) => s.toggleLegend)
  if (!show) return null
  return (
    <div className="w-56 rounded-xl border border-line bg-surface/95 p-3 shadow-sm backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">Links</span>
        <button type="button" onClick={toggle} className="text-faint hover:text-ink" aria-label="Hide legend">
          <X className="size-3.5" />
        </button>
      </div>
      <ul className="space-y-1.5">
        {ROLE_ORDER.map((r) => {
          const m = ROLES[r]
          return (
            <li key={r} className="flex items-center gap-2 text-xs" title={m.description}>
              <svg width="28" height="8" aria-hidden>
                <line x1="0" y1="4" x2="28" y2="4" strokeWidth="2" style={{ stroke: m.color, strokeDasharray: m.dash }} />
              </svg>
              <span className="flex-1">{m.label}</span>
              {m.numeric && <span className="text-[10px] text-faint">calc</span>}
            </li>
          )
        })}
      </ul>
      <p className="mt-2.5 border-t border-line pt-2 text-[10.5px] leading-4 text-faint">
        Inputs sit below, outcomes above. Only “calc” links move numbers in a forecast.
      </p>
    </div>
  )
}
