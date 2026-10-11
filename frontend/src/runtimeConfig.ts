/**
 * Finds out where the Skyline API lives BEFORE the app starts, so the address can change without rebuilding or
 * re-uploading the site (the backend can run behind a tunnel whose address changes).
 *
 * Order: the live copy of config.json on GitHub (updated by deploy/autostart.ps1 whenever the address changes),
 * then the config.json shipped with the site, then the last address that worked on this device.
 * Only the address is read from it, and only an https:// (or localhost) address is accepted.
 */
const LIVE_URL: string =
  ((import.meta as any).env?.VITE_CONFIG_URL as string) ||
  'https://raw.githubusercontent.com/oggigachad/odoo/main/frontend/public/config.json'
const STORE_KEY = 'skyline_api_url'

function acceptable(u: unknown): u is string {
  return typeof u === 'string' && /^(https:\/\/[a-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)\/?$/i.test(u.trim())
}

async function readJson(url: string, ms: number): Promise<string | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctl.signal })
    if (!res.ok) return null
    const data = await res.json()
    return acceptable(data?.apiUrl) ? data.apiUrl.trim().replace(/\/$/, '') : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function loadRuntimeConfig(): Promise<void> {
  // the address may be baked into this build by hand (VITE_API_URL); in development there is nothing to look up
  if ((import.meta as any).env?.DEV) return
  const bucket = Math.floor(Date.now() / 30000) // a fresh copy at most every 30 s, never a stale CDN one
  let url = await readJson(`${LIVE_URL}?t=${bucket}`, 3000)
  if (!url) url = await readJson('/config.json', 3000)
  if (!url) {
    try {
      const saved = localStorage.getItem(STORE_KEY)
      if (acceptable(saved)) url = saved
    } catch { /* storage unavailable */ }
  }
  if (url) {
    ;(window as any).SKYLINE_CONFIG = { apiUrl: url }
    try { localStorage.setItem(STORE_KEY, url) } catch { /* storage unavailable */ }
  }
}
