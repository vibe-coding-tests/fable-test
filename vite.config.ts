/// <reference types="vitest/config" />
import os from 'node:os';
import { defineConfig } from 'vitest/config';

// Leave CPU headroom. Many tests run full headless sims to completion, so saturating
// every core means external load on the box can starve a heavy worker past its timeout.
const cores = os.availableParallelism?.() ?? os.cpus().length ?? 4;
const maxWorkers = Math.max(2, Math.min(cores - 1, Math.ceil(cores * 0.75)));

export default defineConfig({
  base: './',
  server: {
    open: true,
    // the embedded preview browser caches modules too aggressively
    headers: { 'Cache-Control': 'no-store' },
    watch: {
      ignored: ['**/test-results/**', '**/playwright-report/**', '**/blob-report/**']
    }
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
    // Many tests run full headless sims (gyms, raids, gauntlets) or large deterministic
    // compute sweeps (loot pacing, gambit mirrors) to completion. Under concurrent workers
    // these are compute-bound, not latency tests — a saturated box can stretch a ~3s test
    // well past a tight limit. Keep the ceiling high so CPU contention can never time out a
    // deterministic correctness check (which also tears down the worker and cascades
    // spurious failures into sibling files); real hangs still fail, just later.
    testTimeout: 60000,
    hookTimeout: 60000,
    // Process isolation (forks), not the shared-heap threads pool: a file that does time
    // out under load is contained to its own process instead of tearing down a shared
    // worker and cascading spurious failures into the sibling files it was running.
    pool: 'forks',
    // Cap concurrency below the core count so external load can't oversubscribe the box
    // and stall a heavy headless-sim worker past its timeout.
    maxWorkers
  }
});
