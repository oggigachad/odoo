import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { loadRuntimeConfig } from './runtimeConfig'

// Work out where the API is first; the app (and its API client) is only loaded afterwards.
loadRuntimeConfig()
  .catch(() => undefined)
  .then(() => import('./App'))
  .then(({ default: App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })

// Installable app: register the service worker (production builds only, so dev hot-reload is never cached)
if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
