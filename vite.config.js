import { copyFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

function stableLogoAsset() {
  return {
    name: 'stable-logo-asset',
    closeBundle() {
      copyFileSync('Logo.jpg', 'dist/Logo.jpg')
    },
  }
}

const pilotBuild = process.env.VITE_PILOT_BUILD === '1'
const pilotKey = process.env.VITE_PILOT_SUPABASE_ANON_KEY || ''
let pilotJwtRole = ''
try { pilotJwtRole = JSON.parse(Buffer.from(pilotKey.split('.')[1], 'base64url').toString()).role } catch { /* publishable keys are not JWTs */ }
if (pilotKey.startsWith('sb_secret_') || pilotJwtRole === 'service_role') {
  throw new Error('Never embed a Supabase secret/service_role key in a browser bundle')
}
export default defineConfig({
  publicDir: pilotBuild ? false : 'public',
  plugins: [react(), ...(pilotBuild ? [] : [stableLogoAsset()])],
  build: {
    rollupOptions: {
      input: pilotBuild ? resolve(import.meta.dirname, 'pilot.html') : { main: resolve(import.meta.dirname, 'index.html'), pilot: resolve(import.meta.dirname, 'pilot.html') },
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
