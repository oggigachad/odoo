import React, { useState, useEffect, useRef } from 'react'
import { Mail, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

interface EmailInputProps {
  value: string
  onChange: (value: string) => void
  onValidate?: (isValid: boolean, errorMsg?: string) => void
  placeholder?: string
  label?: string
  required?: boolean
  className?: string
  checkDuplicate?: boolean
}

export function formatSmartEmail(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  // If user hasn't typed an '@', automatically append '@gmail.com'
  if (!trimmed.includes('@')) {
    return `${trimmed}@gmail.com`
  }
  return trimmed
}

export default function SmartEmailInput({
  value,
  onChange,
  onValidate,
  placeholder = 'username or user@domain.com',
  label = 'Email Address',
  required = true,
  className = '',
  checkDuplicate = false,
}: EmailInputProps) {
  const [internalDisplay, setInternalDisplay] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [isDuplicate, setIsDuplicate] = useState(false)
  const checkTimeoutRef = useRef<any>(null)

  useEffect(() => {
    setInternalDisplay(value)
  }, [value])

  const validateEmailFormat = (email: string): boolean => {
    if (!email) {
      if (required) {
        setError('Email address is required')
        return false
      }
      setError(null)
      return true
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email format (e.g., name@domain.com)')
      return false
    }

    setError(null)
    return true
  }

  // Handle typing: if user types characters without @, we display what they typed,
  // but onBlur or submission, we format with @gmail.com
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setInternalDisplay(raw)

    // Formatted value
    const formatted = formatSmartEmail(raw)
    onChange(formatted)

    const isValid = validateEmailFormat(formatted)
    if (onValidate) {
      onValidate(isValid, error || undefined)
    }

    // Server-side duplicate check debounce
    if (checkDuplicate && isValid && formatted.includes('@')) {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current)
      setChecking(true)
      checkTimeoutRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`http://localhost:8000/api/v1/auth/check-email?email=${encodeURIComponent(formatted)}`)
          if (res.ok) {
            const data = await res.json()
            if (data.exists) {
              setIsDuplicate(true)
              setError('This email is already registered in the system.')
              if (onValidate) onValidate(false, 'Email already registered')
            } else {
              setIsDuplicate(false)
              if (onValidate) onValidate(true)
            }
          }
        } catch {
          // ignore network check failures
        } finally {
          setChecking(false)
        }
      }, 400)
    } else {
      setIsDuplicate(false)
    }
  }

  const handleBlur = () => {
    // When user leaves the field, if they didn't include an '@', auto-fill @gmail.com
    if (internalDisplay.trim() && !internalDisplay.includes('@')) {
      const completed = `${internalDisplay.trim()}@gmail.com`
      setInternalDisplay(completed)
      onChange(completed)
      validateEmailFormat(completed)
    }
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-white/90">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
      )}
      <div className="relative">
        <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          type="text"
          value={internalDisplay}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={`w-full pl-10 pr-10 py-2.5 rounded-xl text-xs sm:text-sm border transition-all focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40 ${
            error
              ? 'border-rose-400 bg-rose-500/20 text-white placeholder-white/40'
              : internalDisplay && !error && !checking
              ? 'border-emerald-400/50 bg-white/10 text-white placeholder-white/40'
              : 'bg-white/10 border-white/20 text-white placeholder-white/40'
          }`}
        />
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
          {checking ? (
            <Loader2 className="w-4 h-4 text-[#38bdf8] animate-spin" />
          ) : internalDisplay && !error ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : error ? (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          ) : null}
        </div>
      </div>
      {error && <p className="text-[11px] text-rose-300 font-medium pl-1">{error}</p>}
      {!error && internalDisplay && !internalDisplay.includes('@') && (
        <p className="text-[10px] text-white/40 pl-1">
          Auto-completing as <span className="text-[#38bdf8] font-mono">{internalDisplay}@gmail.com</span>
        </p>
      )}
    </div>
  )
}
