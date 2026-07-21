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
        prerender: {
            // P4a Task 7 (blog): 3 internal links inside the blog posts' prose are broken in the
            // OLD app too - `/blog/midi-conversion` and `/blog/ai-conversion`
            // (how-to-use-composer.tsx) don't match any real route, and `/blog/connect-midi-device`
            // (how-to-use-composer.tsx + how-to-use-player.tsx) is missing the `/posts/` segment
            // the real route (`/blog/posts/connect-midi-device`) has. Old's Next.js static export
            // never crawled/validated internal links, so these pre-existing dead links shipped
            // silently; SvelteKit's prerenderer does crawl+validate them and fails the build on any
            // 404 by default. Content parity means preserving the dead links exactly (not
            // "fixing" them to the correct routes) - this allowlists precisely those 3 known paths
            // (still failing the build on any OTHER/unexpected broken link) per the officially
            // documented pattern for deliberate prerender-crawl 404s.
            handleHttpError: ({path, referrer, message}) => {
                const knownDeadLinks = ['/blog/midi-conversion', '/blog/ai-conversion', '/blog/connect-midi-device']
                if (knownDeadLinks.includes(path)) {
                    console.warn(`(preserved dead link, old app quirk) 404 ${path} linked from ${referrer}`)
                    return
                }
                throw new Error(message)
            },
        },
    },
}

export default config
