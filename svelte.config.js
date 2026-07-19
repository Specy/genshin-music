import adapter from '@sveltejs/adapter-static'
import {vitePreprocess} from '@sveltejs/vite-plugin-svelte'

// Build-time game selection (spec §5.5): lowercase game id via PUBLIC_GAME.
// The unselected game's module tree is simply never imported.
const gameId = process.env.PUBLIC_GAME === 'sky' ? 'sky' : 'genshin'
const outDir = process.env.BUILD_PATH ?? 'build'

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter({
            pages: outDir,
            assets: outDir,
            fallback: '404.html',
            precompress: false,
            strict: true,
        }),
        paths: {
            // '' for production build:all; '/skyMusic' | '/genshinMusic' for *-no-root builds
            base: process.env.PUBLIC_BASE_PATH ?? '',
            // absolute asset URLs, mirroring the old app's output; relative refs
            // would break bare /genshinMusic (no trailing slash) on the
            // single-domain deploy
            relative: false,
        },
        alias: {
            $game: `./src/lib/games/${gameId}`,
            $core: './src/lib/core',
            $cmp: './src/lib/components',
            $stores: './src/lib/stores',
            $i18n: './src/lib/i18n',
        },
    },
}

export default config
