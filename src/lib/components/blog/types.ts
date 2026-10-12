import type { GameId } from '$lib/games/types';

export type BlogMetadata = {
  title: string;
  tags: string[];
  relativeUrl: string;
  description: string;
  image?: string;
  createdAt: Date;
  author?: BlogAuthor;
  /**
   * The one game this post is about. Unset means the post is for every game. A post with a game
   * set is left out of, and not built for, the other game's build.
   */
  game?: GameId;
};

export type BlogAuthor = {
  name: string;
  picture?: string;
};
