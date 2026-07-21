import {base} from '$app/paths'
import {SpecyAuthor} from '../BaseBlogPost.svelte'
import type {BlogMetadata} from '../types'

// Old: metadata const from src/app/_client-pages/blog/posts/midi-transpose.tsx
// (`_midiTransposeMetadata`). See add-to-home-screen.ts for the extraction rationale.
export const midiTransposeMetadata: BlogMetadata = {
    title: '🎛️ MIDI music transposition',
    relativeUrl: 'midi-transpose',
    tags: ['Guide'],
    image: `${base}/assets/blog/midi-1.webp`,
    description: "Use MIDI songs to transpose music into the app's sheet",
    createdAt: new Date('2024/03/19'),
    author: SpecyAuthor,
}
