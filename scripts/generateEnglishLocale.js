import clc from 'cli-color';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { LOCALES_DIR, loadEnglish } from './englishLocale.js';

/**
 * Writes the English locale out as static/locales/en.json - the reference every other language is
 * translated from and compared against.
 *
 * GENERATED, NEVER EDITED: the English strings live in src/lib/i18n/locales/en/index.ts (that is
 * the file the app itself bundles, and the one to add a key to). This is a mirror of it in the
 * shape the other locales are written in, so a translator - or whatever is doing the translating -
 * can diff key-for-key against a file that looks exactly like the one they are producing. Rerun it
 * whenever the English file changes.
 *
 * The app never fetches it: English is bundled, so `setI18nLanguage` already has it loaded and the
 * locale cache only ever fetches the other languages (i18nCache.ts).
 *
 * One thing the JSON cannot carry is the English file's inline comments, several of which exist to
 * tell a translator what a string means ("this means snapping to a point", "keep as-is") - read
 * the TypeScript source alongside this when the wording is ambiguous.
 *
 * Usage: npm run generate:english-locale
 */
const OUTPUT = path.join(LOCALES_DIR, 'en.json');

function countKeys(source) {
  return Object.values(source).reduce(
    (total, value) => total + (value !== null && typeof value === 'object' ? countKeys(value) : 1),
    0
  );
}

async function execute() {
  const english = await loadEnglish();
  //2-space + trailing newline, matching what the hand-written locales next to it use. static/ is
  //prettier-ignored, so this file's formatting is whatever is written here.
  await writeFile(OUTPUT, `${JSON.stringify(english, null, 2)}\n`, 'utf8');
  console.log(
    clc.green(`Wrote ${path.relative(process.cwd(), OUTPUT)} (${countKeys(english)} keys)`)
  );
}

execute().catch((e) => {
  console.error(clc.red(e?.stack ?? e));
  process.exit(1);
});
