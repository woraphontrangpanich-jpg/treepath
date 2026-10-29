import type { EdgeRole } from './types'

export interface RoleMeta {
  label: string
  short: string
  description: string
  /** CSS colour variable. */
  color: string
  dash?: string
  numeric: boolean
  /** Derived from formulas; can't be drawn or deleted by hand. */
  derived: boolean
}

export const ROLES: Record<EdgeRole, RoleMeta> = {
  formula: {
    label: 'Formula',
    short: 'formula',
    description: 'Exact maths: the input appears in the target’s formula.',
    color: 'var(--e-formula)',
    numeric: true,
    derived: true,
  },
  cost: {
    label: 'Cost deduction',
    short: 'deduct',
    description: 'Exact maths: the input is subtracted in the target’s formula.',
    color: 'var(--e-cost)',
    numeric: true,
    derived: true,
  },
  driver: {
    label: 'Model driver',
    short: 'model',
    description: 'Fitted from history with linear regression; carries numbers in Scenario.',
    color: 'var(--e-driver)',
    numeric: true,
    derived: false,
  },
  influence: {
    label: 'Influence',
    short: 'influence',
    description: 'Believed to affect the target, but not quantified.',
    color: 'var(--e-influence)',
    dash: '6 4',
    numeric: false,
    derived: false,
  },
  leading: {
    label: 'Leading indicator',
    short: 'leads',
    description: 'Moves before the target; context for timing, not calculated.',
    color: 'var(--e-leading)',
    dash: '10 4 2 4',
    numeric: false,
    derived: false,
  },
  correlation: {
    label: 'Correlation',
    short: 'corr',
    description: 'Moves together, direction unknown. Never calculated.',
    color: 'var(--e-correlation)',
    dash: '2 4',
    numeric: false,
    derived: false,
  },
}

export const ROLE_ORDER: EdgeRole[] = ['formula', 'cost', 'driver', 'influence', 'leading', 'correlation']
export const MANUAL_ROLES: EdgeRole[] = ['driver', 'influence', 'leading', 'correlation']
