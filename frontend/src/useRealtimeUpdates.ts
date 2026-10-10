import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { WS_URL } from './apiClient'

export interface RealtimeMessage {
  type: string
  payload?: any
  status?: string
  timestamp?: number
}

type Listener = (msg: RealtimeMessage) => void

interface RealtimeValue {
  isConnected: boolean
  subscribe: (fn: Listener) => () => void
}

const Ctx = createContext<RealtimeValue>({ isConnected: false, subscribe: () => () => {} })

/**
 * One WebSocket for the whole dashboard. Reconnects with exponential backoff (1s, 2s, 4s, 8s, max 10s)
 * and pings every 25s so proxies keep the socket open.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [isConnected, setConnected] = useState(false)
  const listeners = useRef(new Set<Listener>())

  useEffect(() => {
    let closed = false
    let ws: WebSocket | null = null
    let retry = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let pingTimer: ReturnType<typeof setInterval> | undefined

    const connect = () => {
      if (closed) return
      try {
        ws = new WebSocket(WS_URL)
      } catch {
        schedule()
        return
      }
      ws.onopen = () => {
        retry = 0
        setConnected(true)
        pingTimer = setInterval(() => { try { ws?.send('ping') } catch { /* closing */ } }, 25000)
        // after (re)connecting, tell every panel to refetch so nothing missed during the outage stays stale
        listeners.current.forEach(fn => fn({ type: 'data_changed', payload: { topic: '*' } }))
      }
      ws.onmessage = ev => {
        if (ev.data === 'pong') return
        try {
          const msg: RealtimeMessage = JSON.parse(ev.data)
          listeners.current.forEach(fn => fn(msg))
        } catch { /* ignore malformed frames */ }
      }
      ws.onclose = () => {
        setConnected(false)
        if (pingTimer) clearInterval(pingTimer)
        schedule()
      }
      ws.onerror = () => { try { ws?.close() } catch { /* noop */ } }
    }

    const schedule = () => {
      if (closed) return
      const delay = Math.min(1000 * 2 ** retry, 10000)
      retry += 1
      retryTimer = setTimeout(connect, delay)
    }

    connect()
    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      if (pingTimer) clearInterval(pingTimer)
      try { ws?.close() } catch { /* noop */ }
    }
  }, [])

  const subscribe = (fn: Listener) => {
    listeners.current.add(fn)
    return () => { listeners.current.delete(fn) }
  }

  return createElement(Ctx.Provider, { value: { isConnected, subscribe } }, children)
}

export function useRealtimeStatus() {
  return useContext(Ctx).isConnected
}

/**
 * Re-run `refresh` whenever the server reports a change in one of `topics`
 * (events, shop, finance, members, announcements, fundraisers, dashboard) or the socket reconnects.
 * Bursts are coalesced so a flurry of writes triggers a single refetch.
 */
export function useLiveRefresh(topics: string[], refresh: () => void) {
  const { subscribe } = useContext(Ctx)
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const key = topics.join('|')

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const wanted = new Set(key.split('|'))
    const off = subscribe(msg => {
      if (msg.type === 'data_changed' && (msg.payload?.topic === '*' || wanted.has(msg.payload?.topic))) {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => refreshRef.current(), 250)
      } else if (msg.type === 'stock_updated' && wanted.has('shop')) {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => refreshRef.current(), 250)
      }
    })
    return () => { off(); if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

/** Back-compat for callers that only want the connection flag */
export function useRealtimeUpdates() {
  return { isConnected: useRealtimeStatus() }
}
