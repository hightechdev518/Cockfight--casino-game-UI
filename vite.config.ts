import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    host: '0.0.0.0', // Listen on all network interfaces
    open: true,
    strictPort: true, // Exit if port is already in use
    proxy: {
      // Proxy API requests to backend
      '/balance.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/playerinfo.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/lobbyinfo.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/odds.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/bet_cflive.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/wager_rid.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/bethistory.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/bethistory2.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/history.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/public_history.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/wagerdetail.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/loginuidpid.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/changepid.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      },
      '/start_game.php': {
        target: 'https://apih5.ho8.net',
        changeOrigin: true,
        secure: true
      }
    }
  },
  optimizeDeps: {
    // Exclude hls.js from pre-bundling - it's optional and loaded dynamically
    exclude: ['hls.js']
  },
  build: {
    // Don't fail build if hls.js is missing - it's optional
    rollupOptions: {
      external: () => {
        // Don't externalize hls.js, but allow it to be missing
        return false
      }
    }
  }
})

