import {base} from '$app/paths'
import {SpecyAuthor} from '../BaseBlogPost.svelte'
import type {BlogMetadata} from '../types'

// Old: metadata const from src/app/_client-pages/blog/posts/how-to-use-composer.tsx
// (`_composerTutorialMetadata`). See add-to-home-screen.ts for the extraction rationale.
export const composerTutorialMetadata: BlogMetadata = {
    title: '📀 How to use the composer',
    tags: ['Guide'],
    relativeUrl: 'how-to-use-composer',
    image: `${base}/assets/blog/help-composer.webp`,
    description: 'This is a guide to help you learn how to use the song composer to create and edit songs!',
    createdAt: new Date('2024/03/19'),
    author: SpecyAuthor,
}
