import { error } from '@sveltejs/kit';
import { addToHomeScreenMetadata } from '$cmp/blog/posts/add-to-home-screen';
import { isBlogPostForGame } from '$cmp/blog/allPosts';

// A post for one game is not built for the other: prerender = false leaves no page file on that
// build, and the load turns a client-side visit into a 404 there.
const forThisGame = isBlogPostForGame(addToHomeScreenMetadata);

export const prerender = forThisGame;

export function load() {
  if (!forThisGame) error(404, 'Not found');
}
