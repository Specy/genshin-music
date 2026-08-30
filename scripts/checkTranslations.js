import clc from 'cli-color';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { LOCALES_DIR, loadEnglish } from './englishLocale.js';

/**
 * Compares every translation in static/locales/ against the English locale and reports what
 * each one is missing.
 *
 * English is the source of truth and, unlike the others, is TypeScript
 * (src/lib/i18n/locales/en/index.ts - it is bundled into the app rather than fetched); how it is
 * loaded lives in englishLocale.js, shared with generateEnglishLocale.js.
 *
 * The set of languages checked is the set of files present in static/locales/, minus the
 * generated en.json (checking English against itself is always 100%). A language declared in
 * AVAILABLE_LANGUAGES with no file at all is therefore invisible here; that failure is loud at
 * runtime (the language simply won't load) and reading the declaration would mean evaluating
 * i18n.ts, which pulls in the game registry and SvelteKit's virtual modules.
 *
 * Usage: npm run check:translations [-- --strict]
 *   --strict  exit 1 when anything is missing (for CI); otherwise this only ever reports.
 */

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

function reportKeys(label, keys, color) {
  if (keys.length === 0) return;
  console.log(color(`  ${label} (${keys.length})`));
  for (const key of keys) console.log(`    ${key}`);
}

async function execute() {
  const strict = process.argv.includes('--strict');
  const english = flatten(await loadEnglish());
  const files = (await readdir(LOCALES_DIR))
    .filter((file) => file.endsWith('.json') && file !== 'en.json')
    .sort();

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
