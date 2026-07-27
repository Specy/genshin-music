import {SpecyAuthor} from '../BaseBlogPost.svelte'
import type {BlogMetadata} from '../types'

// See add-to-home-screen.ts for why this lives in its own module.
export const howUseVsrgComposerMetadata: BlogMetadata = {
    title: '🥁 How to use the VSRG composer',
    author: SpecyAuthor,
    description: 'Learn how to use the VSRG composer to create beatmaps of a song',
    createdAt: new Date('2024/03/19'),
    tags: ['Guide'],
    // QUIRK: missing the `${base}` prefix every other post's metadata image
    // has - broken on a no-root base-path build. Reproduced exactly, not
    // "fixed" to match the others.
    image: '/assets/blog/help-vsrg-composer.webp',
    relativeUrl: 'how-to-use-vsrg-composer'
}
