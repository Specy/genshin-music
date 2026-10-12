import { game } from '$game';
import type { GameId } from '$lib/games/types';
import type { BlogMetadata } from './types';
import { addToHomeScreenMetadata } from './posts/add-to-home-screen';
import { easyplay1sMetadata } from './posts/easyplay-1s';
import { composerTutorialMetadata } from './posts/how-to-use-composer';
import { playerTutorialMetadata } from './posts/how-to-use-player';
import { midiTransposeMetadata } from './posts/midi-transpose';
import { midiDeviceMetadata } from './posts/connect-midi-device';
import { aiTransposeMetadata } from './posts/video-audio-transpose';
import { howUseVsrgComposerMetadata } from './posts/how-to-use-vsrg-composer';
import { createBeatmapMetadata } from './posts/how-to-create-a-beatmap';

/** Every post either build knows about. Use blogPostsForGame to list what this build shows. */
export const allBlogPosts: BlogMetadata[] = [
  addToHomeScreenMetadata,
  easyplay1sMetadata,
  composerTutorialMetadata,
  playerTutorialMetadata,
  midiTransposeMetadata,
  midiDeviceMetadata,
  aiTransposeMetadata,
  howUseVsrgComposerMetadata,
  createBeatmapMetadata,
];

/** True when this build shows the post: it is for every game, or for the game being built. */
export function isBlogPostForGame(metadata: BlogMetadata, gameId: GameId = game.id): boolean {
  return metadata.game === undefined || metadata.game === gameId;
}

/** The posts this build lists, links and serves. */
export function blogPostsForGame(): BlogMetadata[] {
  return allBlogPosts.filter((post) => isBlogPostForGame(post));
}
