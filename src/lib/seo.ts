import { base } from '$app/paths';
import { game } from '$game';
import { CANONICAL_ORIGIN_OVERRIDE } from '$lib/env';
import { appPathname } from '$lib/utils/appPathname';

/** The origin this build's pages declare as their own — see game.json's `canonicalOrigin`. */
export const CANONICAL_ORIGIN = CANONICAL_ORIGIN_OVERRIDE || game.meta.canonicalOrigin;

/**
 * Social-preview image for pages that do not bring one of their own. Each game's static overlay
 * ships its own manifestData/main.webp (1280x720), so the default is the active game's screenshot.
 */
export const DEFAULT_SOCIAL_IMAGE = `${base}/manifestData/main.webp`;

/**
 * An absolute URL on the canonical origin for a path this app serves. The path may carry the
 * SvelteKit base (`${base}/assets/...`), which is stripped the same way RootMetadata strips it for
 * the canonical link, so the subpath builds and the root build name the same image. A value that
 * is already absolute passes through unchanged.
 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${CANONICAL_ORIGIN}${appPathname(path)}`;
}

/** The full <title> for a page: its own headline, then the game's name. */
export function documentTitle(headline: string): string {
  return `${headline} | ${game.meta.title}`;
}

const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍]/gu;

/** Visible text with emoji removed, for places that must be plain (titles, JSON-LD headlines). */
export function withoutEmoji(text: string): string {
  return text.replace(EMOJI, '').replace(/\s+/g, ' ').trim();
}

/** `</script>` inside a JSON string would close the surrounding tag; escaping the three
 *  characters that can do that keeps it valid JSON but inert as markup. */
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * The complete <script type="application/ld+json"> element for a schema.org payload.
 *
 * Assembled here rather than in the component because a literal closing script tag inside
 * a Svelte template ends the component's own script block as far as the parser is
 * concerned. serializeJsonLd has already escaped < > and &, so nothing in `value` can
 * close the tag either.
 */
export function jsonLdScriptTag(value: unknown) {
  return `<script type="application/ld+json">${serializeJsonLd(value)}</` + `script>`;
}

/** A schema.org Person, as the JSON-LD on these pages names one. */
export type PersonLd = {
  '@type': 'Person';
  '@id': string;
  name: string;
  alternateName?: string;
  url?: string;
  sameAs?: readonly string[];
};

/**
 * The app's author: the same Person block the other specy.app sites declare, word for word. The
 * shared `@id` is what makes them one entity to a crawler: the app, its blog posts and the other
 * sites all name the same person instead of each describing a "Specy" of its own. Change it
 * everywhere or nowhere.
 */
export const SPECY_PERSON: PersonLd = {
  '@type': 'Person',
  '@id': 'https://specy.app/#person',
  name: 'Enrico Menichelli',
  alternateName: 'Specy',
  url: 'https://specy.app',
  sameAs: ['https://github.com/Specy'],
};

/** Both games are built from this one repository. */
const SOURCE_REPOSITORY = 'https://github.com/Specy/genshin-music';

/**
 * Pages that exist but are not content: surfaces that only make sense with the reader's own data
 * behind them, and the error/maintenance pages. One list for both halves of keeping them out of
 * search results: the sitemap leaves them out, and RootMetadata marks them noindex. Paths are
 * appPathname()-style, without the base.
 */
export const NOINDEX_PATHS: ReadonlySet<string> = new Set([
  // a build-time meta-refresh stub for old deep links (routes/partners/+page.ts), not a page
  '/partners',
  '/error',
  '/delete-cache',
  '/backup',
  '/transfer',
  '/theme',
  '/keybinds',
]);

/**
 * Describes the app itself, sourced from the active game's own metadata so the sky and
 * genshin builds each declare their own identity rather than a shared one.
 */
export function softwareApplicationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: game.meta.title,
    description: game.meta.description,
    url: CANONICAL_ORIGIN,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any (web browser)',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
    featureList: [
      `Compose songs for ${game.display.name}`,
      'Practice a song with approaching circles or guided mode',
      'Import and convert MIDI files',
      'Record and export your own sheets',
      'Connect a MIDI device',
    ],
    author: SPECY_PERSON,
    // isBasedOn and not sameAs: sameAs would declare the repository to BE this app, and the sky
    // and genshin builds both point at the same one, which would merge the two apps into one.
    isBasedOn: { '@type': 'SoftwareSourceCode', codeRepository: SOURCE_REPOSITORY },
  };
}

/** A BreadcrumbList for a trail of app paths, the first being the home page. */
export function breadcrumbLd(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}
