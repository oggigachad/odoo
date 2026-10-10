/**
 * Skyline authentication client.
 *
 * Every account, password hash and role lives in PostgreSQL behind the FastAPI server.
 * The browser only keeps the signed session token; the role it shows is whatever the server
 * returns from /auth/me, so editing localStorage can never grant extra access.
 */

import { api, setToken, getToken } from './apiClient'

export type UserRole = 'Guest' | 'Member' | 'Officer' | 'Treasurer' | 'Admin'

export interface UserAccount {
  id: string
  memberId: number
  name: string
  email: string
  role: UserRole
  roles: string[]
  phone?: string | null
  studentId?: string | null
  isActive: boolean
  validUntil?: string | null
}

interface ApiMember {
  member_id: number
  full_name: string
  email: string
  phone?: string | null
  is_active: boolean
  roles: string[]
  role: UserRole
  student_id?: string | null
  valid_until?: string | null
}

interface SessionResponse { token: string; user: ApiMember }

export function toAccount(m: ApiMember): UserAccount {
  return {
    id: String(m.member_id),
    memberId: m.member_id,
    name: m.full_name,
    email: m.email,
    role: m.role,
    roles: m.roles,
    phone: m.phone,
    studentId: m.student_id,
    isActive: m.is_active,
    validUntil: m.valid_until,
  }
}

function startSession(res: SessionResponse): UserAccount {
  setToken(res.token)
  return toAccount(res.user)
}

export async function loginUser(email: string, password: string): Promise<UserAccount> {
  return startSession(await api<SessionResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  }))
}

export async function registerNewUser(input: {
  name: string
  email: string
  password: string
  otp: string
  phone?: string
  studentId?: string
}): Promise<UserAccount> {
  return startSession(await api<SessionResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      full_name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      password: input.password,
      otp: input.otp.trim(),
      phone: input.phone?.trim() || undefined,
      student_id: input.studentId?.trim() || undefined,
    }),
  }))
}

export async function loginWithGoogleCredential(credential: string): Promise<UserAccount> {
  return startSession(await api<SessionResponse>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  }))
}

/** Step 1 of passwordless sign-in. `devCode` is only returned by non-production servers. */
export async function requestOtp(email: string, purpose: 'login' | 'register' = 'login'): Promise<{ devCode: string | null; expiresIn: number }> {
  const res = await api<{ expires_in: number; dev_otp?: string | null }>('/auth/otp/generate', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), purpose }),
  })
  return { devCode: res.dev_otp ?? null, expiresIn: res.expires_in }
}

export async function verifyOtp(email: string, otp: string): Promise<UserAccount> {
  return startSession(await api<SessionResponse>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase(), otp: otp.trim() }),
  }))
}

/** Re-validates the stored token against the server and returns the authoritative profile. */
export async function fetchCurrentUser(): Promise<UserAccount | null> {
  if (!getToken()) return null
  try {
    return toAccount(await api<ApiMember>('/auth/me'))
  } catch {
    return null
  }
}

export async function logoutUser(): Promise<void> {
  try { await api('/auth/logout', { method: 'POST' }) } catch { /* already signed out */ }
  setToken(null)
}

export async function updateProfile(memberId: number, input: { name?: string; phone?: string }): Promise<void> {
  await api(`/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify({ full_name: input.name, phone: input.phone }),
  })
}

export async function changePassword(currentPassword: string | undefined, newPassword: string): Promise<void> {
  await api('/auth/password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

export async function checkEmailExists(email: string): Promise<boolean> {
  const res = await api<{ exists: boolean }>(`/auth/check-email?email=${encodeURIComponent(email)}`)
  return res.exists
}

export async function registerWithOtp(data: {
  name: string
  email: string
  phone?: string
  studentId?: string
  otp: string
}): Promise<UserAccount> {
  return startSession(
    await api<SessionResponse>('/auth/register-otp', {
      method: 'POST',
      body: JSON.stringify({
        full_name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone?.trim() || null,
        student_id: data.studentId?.trim() || null,
        otp: data.otp.trim(),
      }),
    })
  )
}

/** Which email domains may create an account (students vs organisation staff) */
export async function getSignupRules(): Promise<{ student_domains: string[]; admin_domains: string[] }> {
  return await api<{ student_domains: string[]; admin_domains: string[] }>('/auth/signup-rules')
}

export const GOOGLE_CLIENT_ID: string = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || ''

