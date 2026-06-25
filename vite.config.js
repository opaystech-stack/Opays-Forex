import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['tests/**/*.spec.js', 'api/**', '**/node_modules/**'],
  },
  server: {
    host: '127.0.0.1',
    hmr: {
      host: 'localhost',
      protocol: 'ws',
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
