import adapter from '@sveltejs/adapter-static'
import {vitePreprocess} from '@sveltejs/vite-plugin-svelte'

// Build-time game selection (spec §5.5): lowercase game id via PUBLIC_GAME.
// The unselected game's module tree is simply never imported.
const gameId = process.env.PUBLIC_GAME === 'sky' ? 'sky' : 'genshin'
const outDir = process.env.BUILD_PATH ?? 'build'
// '' for production build:all; '/skyMusic' | '/genshinMusic' for *-no-root builds
const basePath = process.env.PUBLIC_BASE_PATH ?? ''

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
            base: basePath,
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
            //
            // P4a Task 10 fix: SvelteKit's prerender-crawl `path` always includes the configured
            // base (e.g. `/skyMusic/blog/midi-conversion` on the *-no-root builds), so the
            // allowlist below must be base-prefixed too - comparing against the bare `/blog/...`
            // paths only ever matched on the root build (empty base) and threw a hard build
            // failure on every *-no-root build (caught by this task's build:all-no-root gate).
            //
            // P4a Task 10 fix #2: how-to-use-vsrg-composer/+page.svelte carries its own disclosed
            // PRESERVED BUG - 2 of its 3 inline images (old's how-to-use-vsrg-composer.tsx too)
            // are missing the `${base}`/`BASE_PATH` prefix the 3rd image has. Old's Next.js static
            // export never validated asset references, so this shipped silently as broken <img>s
            // on old's real single-domain no-root production deploy (deployBetaSingleDomain.yml
            // -> build:all-no-root); SvelteKit's prerender crawler instead hard-fails the build.
            // Reproducing the bug pixel-for-pixel means the two <img src> stay UNPREFIXED (not
            // "fixed" to add `${base}`) - only the build-tool escape hatch is extended, via the
            // same allowlist mechanism as the dead blog links above. Compared bare (never
            // base-prefixed): the bug IS the missing prefix, so it only ever surfaces as this
            // exact unprefixed path regardless of which base the build uses.
            handleHttpError: ({path, referrer, message}) => {
                const knownDeadLinks = ['/blog/midi-conversion', '/blog/ai-conversion', '/blog/connect-midi-device']
                    .map(link => `${basePath}${link}`)
                const knownMissingBaseAssets = ['/assets/blog/help-vsrg-composer.webp', '/assets/blog/help-vsrg-composer-3.webp']
                if (knownDeadLinks.includes(path) || knownMissingBaseAssets.includes(path)) {
                    console.warn(`(preserved old app quirk) ${path} linked from ${referrer}`)
                    return
                }
                throw new Error(message)
            },
        },
    },
}

export default config
