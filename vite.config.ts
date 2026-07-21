/// <reference types="vitest/config" />
import {sveltekit} from '@sveltejs/kit/vite'
import {defineConfig} from 'vite'

export default defineConfig({
    plugins: [sveltekit()],
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
})
