import type { CSSProperties, ReactNode } from 'react'
import { ACCENT_IDS, accentChannels, type AccentId } from 'nori-root/lib/accent'
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
    {subtitle ? <span className="text-center text-xs text-content-muted">{subtitle}</span> : null}
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
        {detail ? <span className="mt-1 block text-sm leading-5 text-content-muted">{detail}</span> : null}
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
      <span className="block truncate text-sm font-medium" title={title}>
        {title}
      </span>
      {subtitle ? <span className="mt-0.5 block truncate text-xs text-content-subtle">{subtitle}</span> : null}
    </button>
    {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
  </div>
)

/**
 * Each swatch carries both scheme's channels as custom properties and lets CSS
 * pick between them (see .accent-swatch in app.css), so the row repaints on a
 * light/dark flip without re-rendering.
 */
export const AccentSwatches = ({ value, onChange }: { value: AccentId; onChange: (accent: AccentId) => void }) => (
  <div className="flex flex-wrap justify-end gap-1.5" role="radiogroup">
    {ACCENT_IDS.map((accent) => (
      <button
        key={accent}
        type="button"
        role="radio"
        aria-checked={accent === value}
        aria-label={accent}
        onClick={() => onChange(accent)}
        className={`accent-swatch ${accent === value ? 'active' : ''}`}
        style={
          {
            '--accent-swatch-light': accentChannels(accent, 600),
            '--accent-swatch-dark': accentChannels(accent, 400),
          } as CSSProperties
        }
      >
        <span>{accent === value ? <Icon name="check" size={14} /> : null}</span>
      </button>
    ))}
  </div>
)
