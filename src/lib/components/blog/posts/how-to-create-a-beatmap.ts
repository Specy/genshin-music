import { base } from '$app/paths';
import { SpecyAuthor } from '../BaseBlogPost.svelte';
import type { BlogMetadata } from '../types';

// See add-to-home-screen.ts for why this lives in its own module.
export const createBeatmapMetadata: BlogMetadata = {
  title: '🎯 How to create a beatmap',
  tags: ['Guide'],
  relativeUrl: 'how-to-create-a-beatmap',
  image: `${base}/assets/blog/help-vsrg-beatmap.webp`,
  description:
    'What the VSRG mode is, and how to make a beatmap for one of your songs, either by letting the app place the notes or by placing them yourself',
  createdAt: new Date('2026/08/30'),
  author: SpecyAuthor,
};
