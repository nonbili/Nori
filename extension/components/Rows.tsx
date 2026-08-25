import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export const SectionCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="grid gap-3">
    <span className="section-label">{title}</span>
    <div className="section-body">{children}</div>
  </section>
)

export const SectionLabel = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="mb-3 grid justify-items-center gap-1">
    <span className="section-label">{title}</span>
    {subtitle ? <span className="text-center text-xs text-stone-600 dark:text-stone-400">{subtitle}</span> : null}
  </div>
)

export const SettingRow = ({
  icon,
  title,
  detail,
  onClick,
  trailing,
  last,
}: {
  icon: IconName
  title: string
  detail?: string
  onClick?: () => void
  trailing?: ReactNode
  last?: boolean
}) => {
  const body = (
    <>
      <span className="setting-icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block font-medium">{title}</span>
        {detail ? (
          <span className="mt-1 block text-sm leading-5 text-stone-600 dark:text-stone-400">{detail}</span>
        ) : null}
      </span>
      {trailing || (onClick ? <Icon name="chevronRight" size={18} /> : null)}
    </>
  )
  const className = `setting-row ${last ? '' : 'divided'}`
  return onClick ? (
    <button type="button" className={className} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  )
}

export const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={`toggle ${checked ? 'on' : ''}`}
  >
    <span />
  </button>
)

export const Segmented = ({ options }: { options: { label: string; active: boolean; onClick: () => void }[] }) => (
  <div className="flex flex-wrap justify-end gap-2">
    {options.map((option) => (
      <button
        key={option.label}
        type="button"
        className={`segmented ${option.active ? 'active' : ''}`}
        onClick={option.onClick}
      >
        {option.label}
      </button>
    ))}
  </div>
)

export const ManageRow = ({
  title,
  subtitle,
  left,
  actions,
  onClick,
  className,
}: {
  title: string
  subtitle?: string
  left?: ReactNode
  actions?: ReactNode
  onClick?: () => void
  className?: string
}) => (
  <div className={`manage-row ${className || ''}`}>
    {left}
    <button type="button" className="manage-row-main" onClick={onClick} disabled={!onClick}>
      <span className="block truncate text-sm font-medium">{title}</span>
      {subtitle ? <span className="mt-0.5 block truncate text-xs text-stone-500">{subtitle}</span> : null}
    </button>
    {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
  </div>
)
