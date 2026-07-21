import {base} from '$app/paths'
import {SpecyAuthor} from '../BaseBlogPost.svelte'
import type {BlogMetadata} from '../types'

// Old: metadata const from src/app/_client-pages/blog/posts/easyplay-1s.tsx (`_easyplay1sMetadata`).
// See add-to-home-screen.ts for the extraction rationale.
//
// PRESERVED CONTENT QUIRK: the description (and the post body itself) hardcode "Sky Music
// Nightly" literally - this post is genuinely Sky-specific content (the EASYPLAY 1s keyboard
// matches Sky's layout) that old shipped unconditionally on BOTH game builds, with no APP_NAME
// interpolation at all. NOT the `${APP_NAME} Music Nightly}` -> `${game.meta.title}` substitution
// applied elsewhere in this task (there's no template to substitute - it's plain hardcoded prose).
export const easyplay1sMetadata: BlogMetadata = {
    title: '🎹 EASYPLAY 1s',
    tags: ['Product'],
    relativeUrl: 'easyplay-1s',
    image: `${base}/assets/blog/easyplay.webp`,
    description: 'The EASYPLAY 1s, the perfect keyboard for Sky Music Nightly',
    createdAt: new Date('2024/04/24'),
    author: SpecyAuthor,
}
