import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/admin/',
  // Tailwind v4 runs entirely through its Vite plugin — no tailwind.config / postcss.config.
  plugins: [react(), tailwindcss()],
  // @badminton/ui-shared is a pnpm-linked workspace package consumed as its built
  // `dist/`. Under Vite 8's dep optimizer it was served raw (`@fs/…?t=`), so its
  // imports (react, react-dom, @tanstack/react-query, react-router-dom) were only
  // discovered lazily — each discovery forced a re-optimize + full reload, and the
  // mid-load reload left React 19 + StrictMode with a half-mounted tree
  // (createRoot-twice / removeChild NotFoundError in dev). Pre-declaring the package
  // and its React deps makes the optimizer bundle everything in one pass; `dedupe`
  // guarantees a single physical React/react-dom across admin-web and ui-shared.
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
    port: 5174,
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
      '/api/slot-engine': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/slot-engine/, ''),
      },
      '/api/payment': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/payment/, ''),
      },
    },
  },
});
