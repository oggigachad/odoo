/**
 * Thin fetch wrapper for the Skyline API.
 * - Sends the session JWT as a Bearer token (and the httpOnly cookie as a fallback).
 * - Normalises every failure into an ApiError so panels can just show `err.message`.
 */

const HOST: string = (((import.meta as any).env?.VITE_API_URL as string) || 'http://localhost:8000').replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')
export const API_ORIGIN: string = HOST
export const API_BASE = `${HOST}/api/v1`
export const WS_URL = `${HOST.replace(/^http/, 'ws')}/ws/updates`

const TOKEN_KEY = 'skyline_token'

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* storage unavailable */ }
}

export class ApiError extends Error {
  status: number
  code?: string
  /** kept for older panels that read `e.detail` */
  detail: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
    this.detail = message
  }
}

type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) { onUnauthorized = fn }

function extractMessage(body: any, fallback: string): { message: string; code?: string } {
  if (body?.error?.message) return { message: body.error.message, code: body.error.code }
  if (typeof body?.detail === 'string') return { message: body.detail }
  if (Array.isArray(body?.detail) && body.detail[0]?.msg) {
    return { message: String(body.detail[0].msg).replace(/^Value error, /, '') }
  }
  return { message: fallback }
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as any) }
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...opts, headers })
  } catch {
    throw new ApiError('Cannot reach the Skyline server. Check your connection and try again.', 0, 'NETWORK')
  }

  if (!res.ok) {
    let body: any = null
    try { body = await res.json() } catch { /* not json */ }
    const { message, code } = extractMessage(body, res.statusText || 'Request failed')
    if (res.status === 401 && token && onUnauthorized && !path.startsWith('/auth/login')) onUnauthorized()
    throw new ApiError(message, res.status, code)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export function errorMessage(e: unknown, fallback = 'Something went wrong.'): string {
  if (e instanceof ApiError) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as any).message)
  return fallback
}

/** Authenticated download of a binary file (e.g. ticket PDF) */
export function ticketPdfUrl(ticketCode: string, qrPayload: string): string {
  const sig = qrPayload.split('.')[2] || ''
  return `${API_BASE}/tickets/${ticketCode}/pdf?sig=${sig}`
}
export function ticketQrUrl(ticketCode: string, qrPayload: string): string {
  const sig = qrPayload.split('.')[2] || ''
  return `${API_BASE}/tickets/${ticketCode}/qr.png?sig=${sig}`
}
