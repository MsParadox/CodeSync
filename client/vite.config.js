import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
  
    // Running Vite outside Docker (bare metal, both processes on the
    // host)? Override via client/.env: VITE_API_URL=http://localhost:4000
    // VITE_SOCKET_URL=http://localhost:4000 — this bypasses the proxy
    // entirely (see src/services/api.js baseURL fallback).
    proxy: {
      '/api': {
        target: 'http://server:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://server:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom', 'react-redux'],
          'editor-vendor': ['@monaco-editor/react', 'yjs', 'y-monaco'],
          'state-vendor': ['@reduxjs/toolkit'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['yjs', 'y-monaco', '@monaco-editor/react'],
  },
});
