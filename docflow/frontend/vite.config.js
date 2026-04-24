import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.BACKEND_URL || 'http://localhost:8000';

const proxy = {
  '/api': { target: backendTarget, changeOrigin: true },
  '/health': { target: backendTarget, changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy,
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts: true,
    proxy,
  },
});
