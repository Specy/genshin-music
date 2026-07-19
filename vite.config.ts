/// <reference types="vitest/config" />
import {sveltekit} from '@sveltejs/kit/vite'
import {defineConfig} from 'vite'

export default defineConfig({
    plugins: [sveltekit()],
    // Golden-fixture suite (parked until Phase 2 repoints test/imports.ts).
    // jsdom's default UA is desktop — REQUIRED: settings fixtures were
    // captured with desktop defaults (see test/README.md).
    test: {
        environment: 'jsdom',
        setupFiles: ['./test/setup.ts'],
        include: ['test/**/*.test.ts'],
    },
})
