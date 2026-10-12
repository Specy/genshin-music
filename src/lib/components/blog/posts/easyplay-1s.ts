import { base } from '$app/paths';
import { SpecyAuthor } from '../BaseBlogPost.svelte';
import type { BlogMetadata } from '../types';

// See add-to-home-screen.ts for why this lives in its own module.
//
// Sky only: the EASYPLAY 1s is laid out like Sky's instrument, so the post is not built for Genshin.
export const easyplay1sMetadata: BlogMetadata = {
  title: '🎹 EASYPLAY 1s',
  tags: ['Product'],
  relativeUrl: 'easyplay-1s',
  image: `${base}/assets/blog/easyplay.webp`,
  description: 'The EASYPLAY 1s, the perfect keyboard for Sky Music Nightly',
  createdAt: new Date('2024/04/24'),
  author: SpecyAuthor,
  game: 'sky',
};
