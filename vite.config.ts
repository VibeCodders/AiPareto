import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
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
