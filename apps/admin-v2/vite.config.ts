import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // admin-v2 is served at the root of its own dedicated host
  // (admin.elitecourts.duckdns.org) — not under a path prefix like admin-web's /admin/.
  base: '/',
  // Tailwind v4 runs entirely through its Vite plugin — no tailwind.config / postcss.config.
  plugins: [react(), tailwindcss()],
  // Cloned from apps/admin-web/vite.config.ts: @badminton/ui-shared is a pnpm-linked
  // workspace package consumed as its built `dist/`. Pre-declaring the package and its
  // React deps makes Vite 8's optimizer bundle everything in one pass; `dedupe`
  // guarantees a single physical React/react-dom across admin-v2 and ui-shared
  // (prevents the createRoot-twice / removeChild NotFoundError seen in admin-web).
  optimizeDeps: {
    include: [
      '@badminton/ui-shared',
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'react-router-dom',
      'lucide-react',
    ],
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    allowedHosts: true,
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    proxy: {
      '/api/identity': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/identity/, ''),
      },
      '/api/tenant': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/tenant/, ''),
      },
      // F-220: the court/slot-config screen calls slot-engine. admin-web's vite.config has
      // this entry; admin-v2 didn't until this screen needed it. Production is unaffected —
      // Caddy already routes /api/slot-engine/* globally.
      '/api/slot-engine': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/slot-engine/, ''),
      },
    },
  },
});
