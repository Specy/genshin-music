import {base} from '$app/paths'
import {SpecyAuthor} from '../BaseBlogPost.svelte'
import type {BlogMetadata} from '../types'

// See add-to-home-screen.ts for why this lives in its own module.
//
// QUIRK: description below hardcodes "Sky Music Nightly" - this post is
// genuinely Sky-specific (the EASYPLAY 1s keyboard matches Sky's layout) and
// ships unconditionally on both game builds with no game-title interpolation.
// Not an oversight to "fix" with `${game.meta.title}`.
export const easyplay1sMetadata: BlogMetadata = {
    title: '🎹 EASYPLAY 1s',
    tags: ['Product'],
    relativeUrl: 'easyplay-1s',
    image: `${base}/assets/blog/easyplay.webp`,
    description: 'The EASYPLAY 1s, the perfect keyboard for Sky Music Nightly',
    createdAt: new Date('2024/04/24'),
    author: SpecyAuthor,
}
