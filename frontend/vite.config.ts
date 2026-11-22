/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  envDir: path.resolve(__dirname, '..'),
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Dedicated on-demand Firestore vendor chunk (Firestore SDK, RE2JS, WebChannel)
            // Dynamically loaded only when user triggers cloud profile/preference operations
            if (
              id.includes('firestore') ||
              id.includes('re2js') ||
              id.includes('webchannel-wrapper')
            ) {
              return 'vendor-firestore';
            }
            // Eager Firebase Core & Auth (App, Auth, IDB, Component, Logger, Util)
            // Kept eager to preserve zero-flicker auth observer hydration
            // idb is grouped here to keep dependency direction strictly unidirectional: Firestore -> App/Auth
            if (
              id.includes('firebase') ||
              id.includes('@firebase') ||
              id.includes('/idb/')
            ) {
              return 'vendor-firebase-auth';
            }
            // TanStack Query ecosystem
            if (id.includes('@tanstack')) {
              return 'vendor-query';
            }
            // Icon library
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            // React and routing core
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router/') ||
              id.includes('/react-router-dom/') ||
              id.includes('@remix-run') ||
              id.includes('/scheduler/') ||
              id.includes('/use-sync-external-store/')
            ) {
              return 'vendor-react';
            }
          }
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  }
});
