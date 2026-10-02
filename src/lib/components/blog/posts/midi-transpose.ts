import { base } from '$app/paths';
import { SpecyAuthor } from '../BaseBlogPost.svelte';
import type { BlogMetadata } from '../types';

// See add-to-home-screen.ts for why this lives in its own module.
export const midiTransposeMetadata: BlogMetadata = {
  title: '🎛️ MIDI music transposition',
  relativeUrl: 'midi-transpose',
  tags: ['Guide'],
  image: `${base}/assets/blog/midi-1.webp`,
  description: "Use MIDI songs to transpose music into the app's sheet",
  createdAt: new Date('2024/03/19'),
  author: SpecyAuthor,
};
