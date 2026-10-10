/** Keep only what a money field can hold: digits and one decimal point with at most two places. */
export function money(v: string): string {
  let s = v.replace(/[^0-9.]/g, '')
  const i = s.indexOf('.')
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 2)
  return s
}

/** Whole numbers only (quantities, seats, limits). */
export function digits(v: string): string {
  return v.replace(/\D/g, '')
}
