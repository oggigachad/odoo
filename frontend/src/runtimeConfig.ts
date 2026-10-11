/**
 * Finds out where the Skyline API lives BEFORE the app starts, so the address can change without rebuilding or
 * re-uploading the site (the backend can run behind a tunnel whose address changes).
 *
 * Order: the live copy of config.json on GitHub, read through the GitHub API so it is never stale (updated by
 * deploy/autostart.ps1 whenever the address changes); the same file from raw.githubusercontent.com (cached up to 5
 * minutes, used if the API is rate-limited); the config.json shipped with the site; the last address that worked here.
 * Only the address is read from it, and only an https:// (or localhost) address is accepted.
 */
const REPO = ((import.meta as any).env?.VITE_CONFIG_REPO as string) || 'oggigachad/odoo'
const PATH = 'frontend/public/config.json'
const LIVE_API = `https://api.github.com/repos/${REPO}/contents/${PATH}?ref=main`
const LIVE_RAW = `https://raw.githubusercontent.com/${REPO}/main/${PATH}`
const STORE_KEY = 'skyline_api_url'

function acceptable(u: unknown): u is string {
  return typeof u === 'string' && /^(https:\/\/[a-z0-9.-]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)\/?$/i.test(u.trim())
}

async function readJson(url: string, ms: number, headers?: Record<string, string>): Promise<string | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctl.signal, headers })
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
  let url = await readJson(LIVE_API, 3000, { Accept: 'application/vnd.github.raw+json' })
  if (!url) url = await readJson(`${LIVE_RAW}?t=${Math.floor(Date.now() / 30000)}`, 3000)
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
