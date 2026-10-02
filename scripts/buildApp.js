import clc from 'cli-color';
import { execSync } from 'child_process';
import { prepareGameStatic } from './gameStatic.js';

const GAMES = {
  Sky: { id: 'sky', outDir: 'skyMusic' },
  Genshin: { id: 'genshin', outDir: 'genshinMusic' },
};
const chosenApp = process.argv[2];
const date = new Date();
// scripts/commentOnlyCheck.js pins PUBLIC_SW_VERSION so two builds of identical
// source hash identically; every other caller leaves it unset and gets today's
// fresh timestamp, same as before this fallback existed. Also feeds Kit's
// BUILD_VERSION_NAME below, so the SW cache key and Kit's version.name are one value.
const SW_VERSION =
  process.env.PUBLIC_SW_VERSION ||
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}`;

if (!['Genshin', 'Sky', 'All'].includes(chosenApp)) {
  console.error('Please specify an app name [Sky / Genshin / All]');
  process.exit(1);
}

async function execute() {
  const toBuild = chosenApp === 'All' ? ['Sky', 'Genshin'] : [chosenApp];
  try {
    for (const app of toBuild) {
      const { id, outDir } = GAMES[app];
      // Historical quirk, preserved: NO third argv → base '' (production
      // build:all); ANY third argv (scripts pass "false") → subpath base.
      const basePath = process.argv[3] ? `/${outDir}` : '';
      console.log(clc.bold.yellow(`Building ${app}...`));
      await prepareGameStatic(id, basePath);
      execSync('npm run build', {
        stdio: 'inherit',
        env: {
          ...process.env,
          PUBLIC_GAME: id,
          PUBLIC_SW_VERSION: SW_VERSION,
          // Kit's `version.name` (svelte.config.js). It MUST change per deploy: Kit's client
          // compares the version baked into the bundle against `_app/version.json` whenever a
          // load fails, and hard-navigates instead of rendering the error page when they
          // differ - the recovery for a tab that was open across a deploy and imports a hashed
          // chunk that no longer exists. Same timestamp as the SW cache key, one build
          // identity. The `process.env` read (not just SW_VERSION) preserves the pin that
          // commentOnlyCheck.js/classAttrCheck.js set for their byte-identical comparisons.
          BUILD_VERSION_NAME: process.env.BUILD_VERSION_NAME || SW_VERSION,
          PUBLIC_BASE_PATH: basePath,
          BUILD_PATH: `./build/${outDir}`,
        },
      });
      console.log(clc.green(`${app} build complete \n`));
    }
    console.log(clc.bold.green('Build complete \n'));
    process.exit(0);
  } catch (e) {
    console.log(clc.red('[Error]: There was an error building'));
    console.error(e);
    process.exit(1);
  }
}

execute();
