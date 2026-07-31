import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
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
