/**
 * Secure Razorpay Payment Integration Client
 *
 * All credentials are strictly loaded from environment (never hardcoded).
 * Orders are verified cryptographically and checked against database prices on the backend.
 */

import { api } from './apiClient'
import { fetchCurrentUser, type UserAccount } from './authService'

export interface RazorpayOrderInfo {
  order_id: string
  amount: number // in paise
  currency: string
  key_id: string
}

export interface RazorpayVerifyResult {
  status: string
  payment_id: number
  is_active: boolean
  role: string
  message: string
}

let cachedKeyId: string | null = null

export async function getRazorpayKey(): Promise<string> {
  if (cachedKeyId) return cachedKeyId

  // 1. Check frontend environment variable
  const envKey = (import.meta as any).env?.VITE_RAZORPAY_KEY_ID
  if (envKey) {
    cachedKeyId = envKey
    return envKey
  }

  // 2. Fetch from backend config endpoint (loaded from server-side .env)
  try {
    const res = await api<{ key_id: string | null }>('/payments/razorpay/config')
    if (res.key_id) {
      cachedKeyId = res.key_id
      return res.key_id
    }
  } catch (err) {
    console.error('Failed to fetch Razorpay config from backend:', err)
  }

  return ''
}

export async function ensureRazorpayLoaded(): Promise<boolean> {
  if (typeof window !== 'undefined' && (window as any).Razorpay) return true

  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

interface ProcessPaymentOptions {
  category: 'dues' | 'ticket' | 'merchandise' | 'fundraiser'
  amount: string // Exact INR amount e.g. "500.00"
  description: string
  user: UserAccount
  membership_id?: number
  ticket_ids?: number[]
  order_id?: number
  fundraiser_id?: number
  onSuccess: (verifyResult: RazorpayVerifyResult, updatedUser?: UserAccount | null) => void
  onError: (errMsg: string) => void
}

export async function processRazorpayPayment(opts: ProcessPaymentOptions): Promise<void> {
  const loaded = await ensureRazorpayLoaded()
  if (!loaded) {
    opts.onError('Unable to load Razorpay payment gateway. Please check your internet connection.')
    return
  }

  try {
    // 1. Create order on backend with database-verified price
    const order = await api<RazorpayOrderInfo>('/payments/razorpay/order', {
      method: 'POST',
      body: JSON.stringify({
        category: opts.category,
        amount: opts.amount,
        membership_id: opts.membership_id,
        ticket_ids: opts.ticket_ids,
        order_id: opts.order_id,
        fundraiser_id: opts.fundraiser_id,
      }),
    })

    const keyId = order.key_id || (await getRazorpayKey())
    if (!keyId) {
      opts.onError('Razorpay Key ID missing. Ensure RAZORPAY_KEY_ID is configured in .env.')
      return
    }

    // report exactly one outcome
    let settled = false
    const fail = (m: string) => { if (!settled) { settled = true; opts.onError(m) } }

    // 2. Configure Razorpay modal
    const razorpayOptions = {
      key: keyId,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Skyline Student Association',
      description: opts.description,
      order_id: order.order_id,
      image: '/logo.png',
      prefill: {
        name: opts.user.name,
        email: opts.user.email,
        contact: opts.user.phone || '',
      },
      theme: {
        color: '#714B67', // Skyline Odoo Purple
      },
      handler: async (response: any) => {
        if (settled) return
        try {
          // 3. Cryptographically verify signature on the backend
          const verifyResult = await api<RazorpayVerifyResult>('/payments/razorpay/verify', {
            method: 'POST',
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              category: opts.category,
              membership_id: opts.membership_id,
              ticket_ids: opts.ticket_ids,
              order_id: opts.order_id,
              fundraiser_id: opts.fundraiser_id,
            }),
          })

          // 4. Fetch updated user profile from backend (role upgraded to Member!)
          if (verifyResult.status !== 'success' && verifyResult.status !== 'already_processed') throw new Error('Payment was not confirmed.')
          const updatedUser = await fetchCurrentUser()
          settled = true
          opts.onSuccess(verifyResult, updatedUser)
        } catch (err: any) {
          fail(err?.message || 'Payment verification failed. You have not been charged for anything unconfirmed.')
        }
      },
      modal: {
        ondismiss: () => {
          fail('Payment cancelled. Nothing was purchased.')
        },
      },
    }

    const rzp = new (window as any).Razorpay(razorpayOptions)
    rzp.on('payment.failed', (r: any) => fail(`Payment failed: ${r?.error?.description || 'the bank declined it'}. Nothing was purchased.`))
    rzp.open()
  } catch (err: any) {
    opts.onError(err?.message || 'Failed to initiate Razorpay checkout.')
  }
}
