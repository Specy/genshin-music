import {base} from '$app/paths'
import {SpecyAuthor} from '../BaseBlogPost.svelte'
import type {BlogMetadata} from '../types'

// Old: metadata const from src/app/_client-pages/blog/posts/add-to-home-screen.tsx (`_add_to_home_screen`).
//
// Extracted to its own non-route module (NOT exported from the +page.svelte route file itself)
// so routes/blog/+page.svelte's card grid can import every post's metadata without cross-route-file
// importing - not a standard SvelteKit pattern (route files aren't meant to be imported from other
// routes) and risks the whole post component/its images being pulled into the index page's chunk
// graph. This is the idiomatic SvelteKit equivalent instead: a plain $lib module both the index
// page AND this post's own +page.svelte import from - same net effect as old's "each post exports
// its metadata const", just homed one level down from the route file. Same split for all 8 posts.
export const addToHomeScreenMetadata: BlogMetadata = {
    title: '⬇️ Add the app to the home screen',
    tags: ['Guide'],
    relativeUrl: 'add-to-home-screen',
    image: `${base}/manifestData/main.webp`,
    description: 'How to add the website to the home screen on your phone or computer.',
    createdAt: new Date('2024/05/22'),
    author: SpecyAuthor,
}
