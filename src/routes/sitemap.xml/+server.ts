import { CANONICAL_ORIGIN } from '$lib/seo';
import { IS_BETA } from '$lib/env';

export const prerender = true;

/**
 * Routes that exist but are not content: surfaces that only make sense with the reader's
 * own data behind them, and the error/maintenance pages.
 */
const EXCLUDED = new Set([
  // a build-time meta-refresh stub for old deep links (routes/partners/+page.ts), not a page
  '/partners',
  '/error',
  '/delete-cache',
  '/backup',
  '/transfer',
  '/theme',
  '/keybinds',
]);

/** Discovered from the route files, so a new page is listed the moment it exists. */
function routes() {
  const modules = import.meta.glob('/src/routes/**/+page.svelte');
  return Object.keys(modules)
    .map((file) => file.replace('/src/routes', '').replace('/+page.svelte', '') || '/')
    .filter((route) => !route.includes('['))
    .filter((route) => !EXCLUDED.has(route))
    .sort();
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
  const buildDate = new Date().toISOString().slice(0, 10);

  // Deliberately CANONICAL_ORIGIN and not the deployed origin: the subpath builds serve
  // the same pages under /skyMusic and /genshinMusic, and both should point a crawler at
  // the one origin those pages canonicalise to.
  const entries = paths.map(
    (route) => `  <url>
    <loc>${escapeXml(CANONICAL_ORIGIN + route)}</loc>
    <lastmod>${buildDate}</lastmod>
  </url>`
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
