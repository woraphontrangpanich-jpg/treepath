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
    label: 'Subtracted',
    short: 'deduct',
    description: 'Exact maths: the input is subtracted in the target’s formula.',
    color: 'var(--e-cost)',
    numeric: true,
    derived: true,
  },
  driver: {
    label: 'Learned from history',
    short: 'model',
    description: 'Fitted from history with linear regression; carries numbers in Forecast.',
    color: 'var(--e-driver)',
    numeric: true,
    derived: false,
  },
  influence: {
    label: 'Note only',
    short: 'influence',
    description: 'Context only: you believe it matters, but it doesn’t calculate.',
    color: 'var(--e-influence)',
    dash: '6 4',
    numeric: false,
    derived: false,
  },
}

export const ROLE_ORDER: EdgeRole[] = ['formula', 'cost', 'driver', 'influence']
export const MANUAL_ROLES: EdgeRole[] = ['driver', 'influence']
