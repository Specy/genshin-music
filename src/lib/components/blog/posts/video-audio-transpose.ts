import { base } from '$app/paths';
import { SpecyAuthor } from '../BaseBlogPost.svelte';
import type { BlogMetadata } from '../types';

// See add-to-home-screen.ts for why this lives in its own module.
export const aiTransposeMetadata: BlogMetadata = {
  title: '🔬 Video/audio to music transposition',
  tags: ['Guide'],
  relativeUrl: 'video-audio-transpose',
  image: `${base}/assets/blog/midi-btn.webp`,
  description:
    'Use the new feature in the composer to (try to) convert a audio/video into a music sheet. This is an experimental feature',
  createdAt: new Date('2024/03/19'),
  author: SpecyAuthor,
};
