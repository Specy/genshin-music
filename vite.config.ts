/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

// P5 Task 3: named replacement for old's @next/bundle-analyzer (spec §4.1).
// scripts/buildApp.js spawns `npm run build` with `...process.env`, so ANALYZE
// propagates from the `build:*:analyze` scripts without touching that script.
// filename is repo-root-relative (rollup-plugin-visualizer writes via
// fs.writeFile(filename, ...) against process.cwd(), not an output dir) and
// matches .gitignore's pre-existing `build-stats.html` entry — do not
// introduce a second ignored artifact name.
const plugins = [sveltekit()];
if (process.env.ANALYZE === 'true') {
  plugins.push(
    visualizer({
      filename: 'build-stats.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    })
  );
}

export default defineConfig({
  plugins,
  // Vite only exposes import.meta.env.* for vars matching envPrefix (default: just
  // 'VITE_'). Kit's own $env/static|dynamic/public modules read process.env directly
  // and don't go through this — but src/lib/env.ts (Task 9) sources PUBLIC_IS_BETA via
  // plain import.meta.env (see that file's header comment for why), which needs the
  // 'PUBLIC_' prefix registered here too or it's always undefined. Verified empirically:
  // without this line, a PUBLIC_IS_BETA=true build still inlined IS_BETA as false.
  envPrefix: ['VITE_', 'PUBLIC_'],
  // Golden-fixture suite (live since Phase 2; fixtures are ground truth — never regenerate).
  // jsdom's default UA is desktop — REQUIRED: settings fixtures were
  // captured with desktop defaults (see test/README.md).
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
