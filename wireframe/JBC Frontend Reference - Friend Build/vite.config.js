import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@badminton/ui-shared': fileURLToPath(new URL('./src/mocks/ui-shared.ts', import.meta.url))
    }
  }
})
