import { useEffect, useRef, useState } from 'react'

export const DEFAULT_EMAIL_DOMAIN = 'gmail.com'

/** "name" becomes "name@gmail.com"; anything the user typed with an "@" is left exactly as typed. */
export function formatSmartEmail(raw: string, domain: string = DEFAULT_EMAIL_DOMAIN): string {
  const t = raw.trim()
  if (!t) return ''
  return t.includes('@') ? t : `${t}@${domain}`
}

/** The greyed-out part shown after what the user typed: the whole "@gmail.com", or the rest of "gmail.com" once they type "@g...". */
function ghostFor(typed: string, domain: string): string {
  if (!typed.trim()) return ''
  const at = typed.indexOf('@')
  if (at === -1) return `@${domain}`
  const part = typed.slice(at + 1).toLowerCase()
  return part.length < domain.length && domain.startsWith(part) ? domain.slice(part.length) : ''
}

interface Props {
  value: string
  onChange: (email: string) => void
  placeholder?: string
  invalid?: boolean
  domain?: string
  className?: string
  autoFocus?: boolean
}

/**
 * Email field that fills in "@gmail.com" for you. Type just the name and the rest appears greyed out and is used as the
 * address; type "@" (or click into the ending) to use another domain instead. Tab, the right arrow or leaving the field
 * writes the completion into the box so it can be edited like normal text.
 */
export default function SmartEmailInput({ value, onChange, placeholder = 'yourname', invalid = false, domain = DEFAULT_EMAIL_DOMAIN, className = '', autoFocus }: Props) {
  const [typed, setTyped] = useState(value)
  const input = useRef<HTMLInputElement>(null)

  // follow changes made from outside (a cleared form, a stored address)
  useEffect(() => {
    if (formatSmartEmail(typed, domain) !== value) setTyped(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const ghost = ghostFor(typed, domain)

  const commit = (text: string) => {
    const full = `${text.trim()}${ghost}`
    setTyped(full)
    onChange(full.trim())
  }

  const update = (raw: string) => {
    setTyped(raw)
    onChange(formatSmartEmail(raw, domain))
  }

  return (
    <div className={`relative ${className}`}>
      <input
        ref={input}
        type="text"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={typed}
        placeholder={placeholder}
        onChange={e => update(e.target.value)}
        onBlur={() => { if (ghost) commit(typed) }}
        onKeyDown={e => {
          const atEnd = input.current?.selectionStart === typed.length && input.current?.selectionEnd === typed.length
          if (ghost && atEnd && (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'End')) {
            if (e.key === 'Tab') return commit(typed) // let Tab move on after completing
            e.preventDefault(); commit(typed)
          }
        }}
        className={`relative z-10 w-full px-3 py-1.5 rounded-xl text-xs sm:text-sm border bg-transparent text-white placeholder-white/40 transition-all focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40 ${
          invalid ? 'border-rose-400' : 'border-white/20'
        }`}
      />
      {/* background and the greyed-out ending sit behind the input, lined up with its text */}
      <div className={`absolute inset-0 rounded-xl ${invalid ? 'bg-rose-500/20' : 'bg-white/10'}`} aria-hidden />
      <div className="absolute inset-0 z-0 flex items-center px-3 py-1.5 border border-transparent text-xs sm:text-sm whitespace-pre overflow-hidden pointer-events-none" aria-hidden>
        <span className="invisible">{typed}</span>
        <span className="text-white/40">{ghost}</span>
      </div>
    </div>
  )
}
