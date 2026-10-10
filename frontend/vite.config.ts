import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  build: {
    rollupOptions: {
      output: {
        // split big libraries so the app code downloads (and re-downloads after a deploy) separately
        manualChunks: { react: ['react', 'react-dom'], motion: ['motion'], icons: ['lucide-react'] },
      },
    },
  },
  optimizeDeps: {
    // Only scan the real entry point; avoids trying to resolve `three`
    // from skills/ reference HTML files elsewhere in the project tree
    entries: ['index.html'],
  },
})


