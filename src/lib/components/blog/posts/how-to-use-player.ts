import {base} from '$app/paths'
import {SpecyAuthor} from '../BaseBlogPost.svelte'
import type {BlogMetadata} from '../types'

// See add-to-home-screen.ts for why this lives in its own module.
export const playerTutorialMetadata: BlogMetadata = {
    title: '🎵 How to use the player',
    relativeUrl: 'how-to-use-player',
    tags: ['Guide'],
    image: `${base}/assets/blog/help-player.webp`,
    description: 'This is a guide to help you learn how to use the player to learn, record and play songs!',
    createdAt: new Date('2024/03/19'),
    author: SpecyAuthor,
}
