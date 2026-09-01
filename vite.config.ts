/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    // Node by default; the DOM-reliant suites opt into jsdom per file via a @vitest-environment comment.
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/data/**', 'src/vite-env.d.ts'],
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy charting library so it can be cached independently
        // and doesn't delay first paint of the rest of the app.
        manualChunks: {
          recharts: ['recharts'],
        },
      },
    },
  },
})
