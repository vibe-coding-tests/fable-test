/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: {
    // the embedded preview browser caches modules too aggressively
    headers: { 'Cache-Control': 'no-store' }
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/examples/jsm/')) return 'three-addons';
          if (id.includes('/node_modules/three/')) return 'three';
        }
      }
    }
  },
  test: {
    include: ['src/test/**/*.test.ts'],
    environment: 'node',
    // Many tests run full headless sims (gyms, raids, gauntlets) to completion. Under
    // concurrent workers these are compute-bound, not latency tests — give them headroom
    // past the 5s default so CPU contention can't flake a deterministic correctness check.
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
