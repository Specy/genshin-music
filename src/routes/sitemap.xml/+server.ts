import { CANONICAL_ORIGIN, NOINDEX_PATHS } from '$lib/seo';
import { IS_BETA } from '$lib/env';
import { CHANGELOG } from '$core/changelog';
import { allBlogPosts, isBlogPostForGame } from '$cmp/blog/allPosts';
import { blogPostDate, blogPostPath } from '$cmp/blog/structuredData';

export const prerender = true;

/** Blog posts scoped to the other game: their routes are not built for this one. */
const OTHER_GAME_POSTS = new Set(
  allBlogPosts
    .filter((post) => !isBlogPostForGame(post))
    .map((post) => `/blog/posts/${post.relativeUrl}`)
);

/** Discovered from the route files, so a new page is listed the moment it exists. */
function routes() {
  const modules = import.meta.glob('/src/routes/**/+page.svelte');
  return Object.keys(modules)
    .map((file) => file.replace('/src/routes', '').replace('/+page.svelte', '') || '/')
    .filter((route) => !route.includes('['))
    .filter((route) => !NOINDEX_PATHS.has(route))
    .filter((route) => !OTHER_GAME_POSTS.has(route))
    .sort();
}

/**
 * The day each page last changed, for the few pages that know it. Everything else gets no
 * <lastmod> at all: the build date this used to stamp on every URL said every page changed on
 * every deploy, which teaches a crawler to ignore the field.
 */
function lastModified(): Map<string, string> {
  const dates = new Map<string, string>();
  for (const post of allBlogPosts) {
    dates.set(blogPostPath(post), blogPostDate(post.updatedAt ?? post.createdAt));
  }
  // The newest entry, by date rather than by position: the list is not strictly in date order.
  // Its dates are ISO date-only strings, which Date reads as UTC midnight, so the UTC calendar
  // day is the one the entry names (blogPostDate's local-day reading is for the posts' format).
  const newest = Math.max(...CHANGELOG.map((update) => update.date.getTime()));
  if (Number.isFinite(newest)) dates.set('/changelog', new Date(newest).toISOString().slice(0, 10));
  return dates;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET = async () => {
  // The beta is noindex (RootMetadata), so listing its urls would only ever contradict
  // that. It still builds a sitemap, and that sitemap is empty on purpose.
  const paths = IS_BETA ? [] : routes();
  const dates = lastModified();

  // Deliberately CANONICAL_ORIGIN and not the deployed origin: the subpath builds serve
  // the same pages under /skyMusic and /genshinMusic, and both should point a crawler at
  // the one origin those pages canonicalise to.
  const entries = paths.map((route) => {
    const lastmod = dates.get(route);
    return [
      '  <url>',
      `    <loc>${escapeXml(CANONICAL_ORIGIN + route)}</loc>`,
      ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
      '  </url>',
    ].join('\n');
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
