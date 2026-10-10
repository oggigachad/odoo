import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  optimizeDeps: {
    // Only scan the real entry point; avoids trying to resolve `three`
    // from skills/ reference HTML files elsewhere in the project tree
    entries: ['index.html'],
  },
})


