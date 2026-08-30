import path from 'node:path';
import { createServer } from 'vite';

/**
 * Loads the English locale - the source of truth for every other language, and the only one that
 * is TypeScript (src/lib/i18n/locales/en/index.ts; it is bundled into the app rather than fetched).
 *
 * Shared by checkTranslations.js (which compares the other locales against it) and
 * generateEnglishLocale.js (which writes it out as static/locales/en.json), so "how English is
 * read" has one definition.
 *
 * It goes through Vite's own SSR module loader rather than a hand-rolled TS strip: Vite is already
 * a devDependency, it handles the transform on any Node version, and the file stays the single
 * definition of the key set. `configFile: false` keeps the app's real Vite config (and the
 * SvelteKit plugin, which would want PUBLIC_GAME and a full game registry) out of it - the locale
 * file's only imports are type-only, so nothing needs alias resolution.
 */
export const ROOT = path.resolve(import.meta.dirname, '..');
export const LOCALES_DIR = path.join(ROOT, 'static/locales');
const ENGLISH_MODULE = '/src/lib/i18n/locales/en/index.ts';

export async function loadEnglish() {
  const server = await createServer({
    configFile: false,
    root: ROOT,
    logLevel: 'error',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  try {
    const module = await server.ssrLoadModule(ENGLISH_MODULE);
    if (!module.i18n_en) throw new Error(`${ENGLISH_MODULE} does not export i18n_en`);
    return module.i18n_en;
  } finally {
    await server.close();
  }
}
