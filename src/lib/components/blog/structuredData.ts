import { base } from '$app/paths';
import { game } from '$game';
import { absoluteUrl, DEFAULT_SOCIAL_IMAGE, withoutEmoji } from '$lib/seo';
import type { BlogMetadata } from './types';

/**
 * The post's date as YYYY-MM-DD. The posts' createdAt values are local midnight, so reading the
 * local date parts keeps the calendar day the author wrote, wherever the build runs; a full ISO
 * timestamp would shift it to the previous day east of UTC.
 */
export function blogPostDate(createdAt: Date): string {
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const day = String(createdAt.getDate()).padStart(2, '0');
  return `${createdAt.getFullYear()}-${month}-${day}`;
}

/** The post's own address on the canonical origin. */
export function blogPostPath(metadata: BlogMetadata): string {
  return `/blog/posts/${metadata.relativeUrl}`;
}

/**
 * schema.org BlogPosting for one post. Every URL is absolute on the canonical origin, so the
 * subpath and root builds of the same post declare the same identity.
 */
export function blogPostingLd(metadata: BlogMetadata) {
  const author = metadata.author;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: withoutEmoji(metadata.title),
    description: metadata.description,
    image: absoluteUrl(metadata.image ?? DEFAULT_SOCIAL_IMAGE),
    datePublished: blogPostDate(metadata.createdAt),
    author: author
      ? {
          ...(author.person ?? { '@type': 'Person', name: author.name }),
          ...(author.picture && { image: absoluteUrl(author.picture) }),
        }
      : { '@type': 'Organization', name: game.meta.title },
    publisher: {
      '@type': 'Organization',
      name: game.meta.title,
      logo: { '@type': 'ImageObject', url: absoluteUrl(`${base}/logo512.png`) },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(blogPostPath(metadata)) },
    inLanguage: 'en',
  };
}
