import { useEffect, useId, useRef, useState } from 'react'

export type ForgeSelectOption = {
  value: string
  label: string
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: ForgeSelectOption[]
  placeholder?: string
  className?: string
  'aria-label'?: string
  disabled?: boolean
}

export function ForgeSelect({
  value,
  onChange,
  options,
  placeholder = '请选择',
  className = '',
  'aria-label': ariaLabel,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = options.find((o) => o.value === value)
  const label = selected?.label || placeholder

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      className={`forge-select ${open ? 'open' : ''} ${disabled ? 'disabled' : ''} ${className}`.trim()}
    >
      <button
        type="button"
        className="forge-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={!selected ? 'is-placeholder' : undefined}>{label}</span>
        <span className="forge-select-caret" aria-hidden />
      </button>
      {open && (
        <ul id={listId} className="forge-select-menu" role="listbox">
          {options.map((opt) => {
            const active = opt.value === value
            return (
              <li key={opt.value || '__empty'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`forge-select-option ${active ? 'active' : ''}`}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
