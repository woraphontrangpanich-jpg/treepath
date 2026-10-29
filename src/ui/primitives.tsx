import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={clsx(
        'press inline-flex items-center justify-center gap-1.5 rounded-lg font-medium disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variant === 'primary' && 'bg-accent text-accent-ink shadow-[0_1px_0_rgb(0_0_0/0.08),inset_0_1px_0_rgb(255_255_255/0.18)] hover:brightness-110',
        variant === 'secondary' && 'border border-line bg-surface text-ink hover:bg-surface-2',
        variant === 'ghost' && 'text-muted hover:bg-surface-2 hover:text-ink',
        variant === 'danger' && 'text-down hover:bg-down-soft',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        'h-8 rounded-md border border-line bg-surface px-2 text-sm text-ink hover:border-faint disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export type Tone = 'neutral' | 'accent' | 'formula' | 'warn' | 'down' | 'up'

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4',
        tone === 'neutral' && 'bg-surface-2 text-muted ring-1 ring-line ring-inset',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'formula' && 'bg-formula-soft text-formula',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'down' && 'bg-down-soft text-down',
        tone === 'up' && 'bg-accent-soft text-up',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex rounded-lg bg-surface-2 p-0.5 ring-1 ring-line" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-3 text-sm',
            value === o.value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 className="text-[13px] font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  )
}
