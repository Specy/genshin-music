import type { GameId } from '$lib/games/types';
import type { PersonLd } from '$lib/seo';

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
  /**
   * The schema.org Person this author already is elsewhere. Set, the post's JSON-LD names that
   * Person (its `@id` included) instead of describing an author from `name` alone.
   */
  person?: PersonLd;
};
