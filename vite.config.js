import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { configDefaults } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 30000,
    // Les tests e2e Playwright (testDir ./tests) ont leur propre exécuteur :
    // on les exclut de la collecte Vitest pour éviter les erreurs de collecte.
    exclude: [...configDefaults.exclude, 'tests/**'],
    env: {
      VITE_DATA_BACKEND: 'mock',
    },
  },
  server: {
    host: '127.0.0.1',
    hmr: {
      host: 'localhost',
      protocol: 'ws',
    },
    // Proxy de développement : /api -> backend Fastify local. Garde les appels
    // au backend SAME-ORIGIN côté navigateur, condition nécessaire pour que le
    // cookie de session httpOnly `sameSite=lax` accompagne /api/auth/me en dev
    // (reproduit le comportement de production, cf. auth-access-mobile-fixes Z1).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Ensure consistent hashing for cache busting
    rollupOptions: {
      output: {
        // Use contenthash for long-term caching
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    // Disable source maps in production for security
    sourcemap: false,
  },
})
