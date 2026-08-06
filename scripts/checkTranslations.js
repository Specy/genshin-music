import clc from 'cli-color';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';

/**
 * Compares every translation in static/locales/ against the English locale and reports what
 * each one is missing.
 *
 * English is the source of truth and, unlike the others, is TypeScript
 * (src/lib/i18n/locales/en/index.ts - it is bundled into the app rather than fetched). It is
 * loaded through Vite's own SSR module loader rather than a hand-rolled TS strip: Vite is
 * already a devDependency, it handles the transform on any Node version, and the file stays
 * the single definition of the key set. `configFile: false` keeps the app's real Vite config
 * (and the SvelteKit plugin, which would want PUBLIC_GAME and a full game registry) out of it -
 * the locale file's only imports are type-only, so nothing needs alias resolution.
 *
 * The set of languages checked is the set of files present in static/locales/. A language
 * declared in AVAILABLE_LANGUAGES with no file at all is therefore invisible here; that failure
 * is loud at runtime (the language simply won't load) and reading the declaration would mean
 * evaluating i18n.ts, which pulls in the game registry and SvelteKit's virtual modules.
 *
 * Usage: npm run check:translations [-- --strict]
 *   --strict  exit 1 when anything is missing (for CI); otherwise this only ever reports.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const ENGLISH_MODULE = '/src/lib/i18n/locales/en/index.ts';
const LOCALES_DIR = path.join(ROOT, 'static/locales');

/** Flattens nested namespaces to the dot-paths i18next addresses them by. */
function flatten(source, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(source)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, dotted, out);
    } else {
      out.set(dotted, value);
    }
  }
  return out;
}

async function loadEnglish() {
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

function reportKeys(label, keys, color) {
  if (keys.length === 0) return;
  console.log(color(`  ${label} (${keys.length})`));
  for (const key of keys) console.log(`    ${key}`);
}

async function execute() {
  const strict = process.argv.includes('--strict');
  const english = flatten(await loadEnglish());
  const files = (await readdir(LOCALES_DIR)).filter((file) => file.endsWith('.json')).sort();

  console.log(
    clc.blue(`Checking ${files.length} translations against ${english.size} English keys\n`)
  );
  let incomplete = 0;

  for (const file of files) {
    const language = path.basename(file, '.json');
    let translated;
    try {
      translated = flatten(JSON.parse(await readFile(path.join(LOCALES_DIR, file), 'utf8')));
    } catch (e) {
      console.log(clc.red(`${language}: could not be read - ${e.message}\n`));
      incomplete++;
      continue;
    }
    const missing = [...english.keys()].filter((key) => !translated.has(key));
    // A key the app no longer has: harmless at runtime, but it is dead weight in the file and
    // usually means a key was renamed and the translation was left behind under the old name.
    const stale = [...translated.keys()].filter((key) => !english.has(key));
    const empty = [...translated]
      .filter(([key, value]) => english.has(key) && typeof value === 'string' && !value.trim())
      .map(([key]) => key);

    const translatedCount = english.size - missing.length;
    const percentage = Math.round((translatedCount / english.size) * 100);
    const summary = `${language}: ${translatedCount}/${english.size} (${percentage}%)`;
    const isComplete = missing.length === 0 && empty.length === 0;
    console.log(isComplete ? clc.green(summary) : clc.yellow(summary));
    if (!isComplete) incomplete++;

    reportKeys('missing', missing, clc.red);
    reportKeys('empty', empty, clc.red);
    reportKeys('no longer in English', stale, clc.blackBright);
    console.log('');
  }

  if (incomplete === 0) {
    console.log(clc.green('Every translation is complete'));
    return;
  }
  console.log(clc.yellow(`${incomplete} of ${files.length} translations are incomplete`));
  if (strict) process.exit(1);
}

execute().catch((e) => {
  console.error(clc.red(e?.stack ?? e));
  process.exit(1);
});
