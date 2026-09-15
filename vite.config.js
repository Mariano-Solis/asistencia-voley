import { copyFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function stableLogoAsset() {
  return {
    name: 'stable-logo-asset',
    closeBundle() {
      copyFileSync('Logo.jpg', 'dist/Logo.jpg')
    },
  }
}

export default defineConfig({
  plugins: [react(), stableLogoAsset()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react-vendor'
          if (id.includes('@supabase')) return 'supabase-vendor'
          return 'vendor'
        },
      },
    },
  },
})
