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
    author: {
      '@type': 'Person',
      name: 'Specy',
      url: 'https://specy.app',
      sameAs: ['https://github.com/Specy'],
    },
    sameAs: ['https://github.com/Specy/genshin-music'],
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
