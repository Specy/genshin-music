import {SpecyAuthor} from '../BaseBlogPost.svelte'
import type {BlogMetadata} from '../types'

// Old: metadata const from src/app/_client-pages/blog/posts/how-to-use-vsrg-composer.tsx
// (`_howUseVsrgComposer`). See add-to-home-screen.ts for the extraction rationale.
//
// PRESERVED BUG: old's `image` here is the literal string `"/assets/blog/help-vsrg-composer.webp"`
// with NO `BASE_PATH +` prefix (unlike every other post's metadata image, and unlike this same
// post's OWN `-2.webp` body image) - broken on a no-root base-path build. Reproduced exactly: no
// `${base}` interpolation on this one field (the post's own +page.svelte preserves the same gap
// on its 2 matching inline `<BlogImage>` uses of this file and of `-3.webp`).
export const howUseVsrgComposerMetadata: BlogMetadata = {
    title: '🥁 How to use the VSRG composer',
    author: SpecyAuthor,
    description: 'Learn how to use the VSRG composer to create beatmaps of a song',
    createdAt: new Date('2024/03/19'),
    tags: ['Guide'],
    image: '/assets/blog/help-vsrg-composer.webp',
    relativeUrl: 'how-to-use-vsrg-composer'
}
