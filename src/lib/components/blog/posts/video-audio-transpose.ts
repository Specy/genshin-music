import {base} from '$app/paths'
import {SpecyAuthor} from '../BaseBlogPost.svelte'
import type {BlogMetadata} from '../types'

// Old: metadata const from src/app/_client-pages/blog/posts/video-audio-transpose.tsx
// (`_aiTransposeMetadata`). See add-to-home-screen.ts for the extraction rationale.
export const aiTransposeMetadata: BlogMetadata = {
    title: '🔬 Video/audio to music transposition',
    tags: ['Guide'],
    relativeUrl: 'video-audio-transpose',
    image: `${base}/assets/blog/midi-btn.webp`,
    description: 'Use the new feature in the composer to (try to) convert a audio/video into a music sheet. This is an experimental feature',
    createdAt: new Date('2024/03/19'),
    author: SpecyAuthor,
}
