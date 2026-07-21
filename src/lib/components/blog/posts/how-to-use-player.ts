import {base} from '$app/paths'
import {SpecyAuthor} from '../BaseBlogPost.svelte'
import type {BlogMetadata} from '../types'

// Old: metadata const from src/app/_client-pages/blog/posts/how-to-use-player.tsx
// (`_playerTutorialMetadata`). See add-to-home-screen.ts for the extraction rationale.
export const playerTutorialMetadata: BlogMetadata = {
    title: '🎵 How to use the player',
    relativeUrl: 'how-to-use-player',
    tags: ['Guide'],
    image: `${base}/assets/blog/help-player.webp`,
    description: 'This is a guide to help you learn how to use the player to learn, record and play songs!',
    createdAt: new Date('2024/03/19'),
    author: SpecyAuthor,
}
