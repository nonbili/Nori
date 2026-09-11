import type { CSSProperties, ReactNode } from 'react'
import { ACCENT_IDS, accentChannels, isCustomAccent, type AccentId } from 'nori-root/lib/accent'
import { channelsToRgb, hexToRgb, rgbToHex } from 'nori-root/lib/oklch'
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
export const AccentSwatches = ({
  value,
  onChange,
  customLabel,
}: {
  value: AccentId
  onChange: (accent: AccentId) => void
  customLabel: string
}) => (
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
    <CustomAccentSwatch value={value} onChange={onChange} label={customLabel} />
  </div>
)

/**
 * The custom accent, as the browser's own colour picker.
 *
 * The app builds hue and intensity strips by hand because React Native has no
 * picker; on the web there is one, and it is the control people already know,
 * so the shells use it instead of a port of the app's strips. The input is
 * visually hidden behind the swatch it opens, and updates live while dragging.
 */
const CustomAccentSwatch = ({
  value,
  onChange,
  label,
}: {
  value: AccentId
  onChange: (accent: AccentId) => void
  label: string
}) => {
  const custom = isCustomAccent(value)
  return (
    <label
      className={`accent-swatch ${custom ? 'active' : ''}`}
      aria-label={label}
      style={
        {
          '--accent-swatch-light': custom ? accentChannels(value, 600) : 'var(--nori-muted)',
          '--accent-swatch-dark': custom ? accentChannels(value, 400) : 'var(--nori-muted)',
        } as CSSProperties
      }
    >
      <span className={custom ? '' : 'text-content-muted'}>
        {/* The palette glyph needs more room than the presets' check mark. */}
        <Icon name={custom ? 'check' : 'palette'} size={custom ? 14 : 18} />
      </span>
      <input
        type="color"
        className="sr-only"
        // The stored colour when there is one, rather than the ramp's 600:
        // generation rescales chroma, so feeding the 600 back would walk the
        // picker's colour a little further each time it was opened.
        value={(custom ? hexToRgb(value) : null) ? value : rgbToHex(channelsToRgb(accentChannels(value, 600)))}
        onChange={(event) => onChange(event.target.value as AccentId)}
      />
    </label>
  )
}
