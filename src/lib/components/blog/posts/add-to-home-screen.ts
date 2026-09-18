import { base } from '$app/paths';
import { SpecyAuthor } from '../BaseBlogPost.svelte';
import type { BlogMetadata } from '../types';

// Lives in its own $lib module, not exported from this post's +page.svelte,
// so routes/blog/+page.svelte's card grid can import every post's metadata
// without importing across route files - importing from another route risks
// pulling that whole post's component/images into the index page's bundle.
// Same split for every post.
export const addToHomeScreenMetadata: BlogMetadata = {
  title: '⬇️ Add the app to the home screen',
  tags: ['Guide'],
  relativeUrl: 'add-to-home-screen',
  image: `${base}/manifestData/main.webp`,
  description: 'How to add the website to the home screen on your phone or computer.',
  createdAt: new Date('2024/05/22'),
  author: SpecyAuthor,
};
