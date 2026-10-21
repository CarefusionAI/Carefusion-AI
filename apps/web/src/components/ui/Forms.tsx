import { useState } from 'react'
import type {
  ChangeEvent,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import clsx from 'clsx'
import { Glyph } from './Glyph'
import { useStableId } from './useStableId'

function RequiredMark({ required, optional }: { required?: boolean; optional?: boolean }) {
  if (required)
    return (
      <span className="cf-req" aria-hidden="true">
        {' '}
        *
      </span>
    )
  if (optional) return <span className="cf-opt"> (optional)</span>
  return null
}

function FieldMessage({ id, error, helper }: { id: string; error?: string; helper?: string }) {
  const message = error || helper
  if (!message) return null
  return (
    <p id={id} className={clsx('cf-field-msg', error && 'is-error')}>
      {error ? <Glyph name="danger" size={16} /> : null}
      <span>{message}</span>
    </p>
  )
}

/* ---------- TextField ---------- */
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string
  helper?: string
  error?: string
  prefix?: ReactNode
  optional?: boolean
}

export function TextField({
  label,
  helper,
  error,
  prefix,
  optional,
  className,
  type = 'text',
  id: idProp,
  ...rest
}: TextFieldProps) {
  const id = useStableId('cf-field', idProp)
  const [shown, setShown] = useState(false)
  const isPassword = type === 'password'
  const msgId = `${id}-msg`
  const hasMessage = Boolean(error || helper)
  return (
    <div className={clsx('cf-field', error && 'has-error', rest.disabled && 'is-disabled', className)}>
      <label className="cf-field-label" htmlFor={id}>
        {label}
        <RequiredMark required={rest.required} optional={optional} />
      </label>
      <div className="cf-field-box">
        {prefix ? (
          <span className="cf-field-prefix" aria-hidden={typeof prefix === 'string' ? undefined : true}>
            {prefix}
          </span>
        ) : null}
        <input
          {...rest}
          id={id}
          className="cf-field-input"
          type={isPassword && shown ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-required={rest.required ? true : undefined}
          aria-describedby={hasMessage ? msgId : undefined}
        />
        {isPassword ? (
          <button
            type="button"
            className="cf-field-reveal"
            aria-label={shown ? 'Hide password' : 'Show password'}
            aria-pressed={shown}
            onClick={() => setShown((s) => !s)}
          >
            <Glyph name={shown ? 'eyeOff' : 'eye'} />
          </button>
        ) : null}
      </div>
      <FieldMessage id={msgId} error={error} helper={helper} />
    </div>
  )
}

/* ---------- Select ---------- */
export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'children'> {
  label?: string
  helper?: string
  error?: string
  options: (string | SelectOption)[]
  placeholder?: string
  optional?: boolean
  onChange?: (value: string, event: ChangeEvent<HTMLSelectElement>) => void
}

export function Select({
  label,
  helper,
  error,
  options,
  placeholder,
  optional,
  className,
  id: idProp,
  onChange,
  ...rest
}: SelectProps) {
  const id = useStableId('cf-sel', idProp)
  const msgId = `${id}-msg`
  const opts: SelectOption[] = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  return (
    <div className={clsx('cf-field', error && 'has-error', className)}>
      {label ? (
        <label className="cf-field-label" htmlFor={id}>
          {label}
          <RequiredMark required={rest.required} optional={optional} />
        </label>
      ) : null}
      <select
        {...rest}
        id={id}
        className="cf-select"
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helper ? msgId : undefined}
        onChange={onChange ? (e) => onChange(e.target.value, e) : undefined}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldMessage id={msgId} error={error} helper={helper} />
    </div>
  )
}

/* ---------- Textarea ---------- */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  helper?: string
  error?: string
  optional?: boolean
}

export function Textarea({ label, helper, error, optional, className, id: idProp, ...rest }: TextareaProps) {
  const id = useStableId('cf-ta', idProp)
  const msgId = `${id}-msg`
  return (
    <div className={clsx('cf-field', error && 'has-error', className)}>
      <label className="cf-field-label" htmlFor={id}>
        {label}
        <RequiredMark required={rest.required} optional={optional} />
      </label>
      <textarea
        rows={4}
        {...rest}
        id={id}
        className="cf-textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helper ? msgId : undefined}
      />
      <FieldMessage id={msgId} error={error} helper={helper} />
    </div>
  )
}

/* ---------- Checkbox ---------- */
export interface CheckboxProps {
  label: ReactNode
  description?: ReactNode
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  required?: boolean
  name?: string
  className?: string
  onChange?: (checked: boolean) => void
}

export function Checkbox({
  label,
  description,
  checked,
  defaultChecked,
  disabled,
  required,
  name,
  className,
  onChange,
}: CheckboxProps) {
  const [inner, setInner] = useState(Boolean(defaultChecked))
  const controlled = checked !== undefined
  const on = controlled ? checked : inner
  return (
    <label className={clsx('cf-check', disabled && 'is-disabled', className)}>
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        name={name}
        required={required}
        onChange={(e) => {
          if (!controlled) setInner(e.target.checked)
          onChange?.(e.target.checked)
        }}
      />
      <span className="cf-check-box" aria-hidden="true">
        <Glyph name="check" size={14} />
      </span>
      <span className="cf-check-text">
        <span>{label}</span>
        {description ? <span className="cf-check-desc">{description}</span> : null}
      </span>
    </label>
  )
}

/* ---------- Switch ---------- */
export interface SwitchProps {
  label: ReactNode
  description?: ReactNode
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  className?: string
  onChange?: (checked: boolean) => void
}

export function Switch({ label, description, checked, defaultChecked, disabled, className, onChange }: SwitchProps) {
  const [inner, setInner] = useState(Boolean(defaultChecked))
  const controlled = checked !== undefined
  const on = controlled ? checked : inner
  const labelId = useStableId('cf-sw')
  function toggle() {
    if (disabled) return
    if (!controlled) setInner(!on)
    onChange?.(!on)
  }
  return (
    <div className={clsx('cf-switch-row', className)}>
      <span className="cf-switch-text">
        <span id={labelId} className="cf-switch-label">
          {label}
        </span>
        {description ? <span className="cf-switch-desc">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={labelId}
        disabled={disabled}
        className={clsx('cf-switch', on && 'is-on')}
        onClick={toggle}
      >
        <span className="cf-switch-thumb" aria-hidden="true" />
      </button>
    </div>
  )
}
