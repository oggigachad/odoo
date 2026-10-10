// Skyline service worker: app-shell cache so the installed app opens (and the door scanner loads) without signal.
// API calls are never cached: live data must always come from the server.
const CACHE = 'skyline-shell-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/logo.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')))
    return
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && (url.pathname.startsWith('/assets/') || /\.(png|jpg|svg|webp|woff2?)$/.test(url.pathname))) {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(req, copy))
      }
      return res
    }))
  )
})
