import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0', // Listen on all network interfaces
    open: true,
    strictPort: true // Exit if port is already in use
  },
  optimizeDeps: {
    // Exclude hls.js from pre-bundling - it's optional and loaded dynamically
    exclude: ['hls.js']
  },
  build: {
    // Don't fail build if hls.js is missing - it's optional
    rollupOptions: {
      external: (id) => {
        // Don't externalize hls.js, but allow it to be missing
        return false
      }
    }
  }
})

