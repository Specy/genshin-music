import fse from 'fs-extra';
import urlJoin from 'url-join';
import clc from 'cli-color';

/**
 * Copy the active game's instrument samples (ADR-0003: they live in
 * src/lib/games/<id>/instruments/<Name>/ next to their meta.json) to the
 * URL-locked static/assets/audio/<id>/<Name>/ paths — gitignored overlay, like
 * the static/ files below. Only the samples meta.json references are copied
 * (never meta.json itself or docs like a README.md), and every game's audio
 * overlay dir is cleaned first so a previous build/dev run of the OTHER game
 * can't leak its audio into this build's output.
 */
async function prepareGameAudio(id) {
  const gamesRoot = './src/lib/games';
  for (const gameId of await fse.readdir(gamesRoot)) {
    if (!(await fse.pathExists(`${gamesRoot}/${gameId}/instruments`))) continue;
    await fse.remove(`./static/assets/audio/${gameId}`);
  }
  const instrumentsDir = `${gamesRoot}/${id}/instruments`;
  const presets = await fse.readJson(`${gamesRoot}/${id}/presets.json`);
  for (const name of await fse.readdir(instrumentsDir)) {
    const meta = await fse.readJson(`${instrumentsDir}/${name}/meta.json`);
    const notes = typeof meta.notes === 'string' ? presets[meta.notes] : meta.notes;
    if (!Array.isArray(notes)) {
      throw new Error(`[gameStatic] ${id}/${name}: unknown notes preset "${meta.notes}"`);
    }
    for (let i = 0; i < notes.length; i++) {
      const file = notes[i].file ?? `${i}.mp3`;
      await fse.copy(
        `${instrumentsDir}/${name}/${file}`,
        `./static/assets/audio/${id}/${name}/${file}`
      );
    }
  }
}

/**
 * Copy src/lib/games/<id>/static into static/ (gitignored overlay paths)
 * and rewrite static/manifest.json for the given base path.
 * Mirrors the old public/-copy + updateManifest behavior byte-for-byte.
 */
export async function prepareGameStatic(id, basePath) {
  await prepareGameAudio(id);
  await fse.copy(`./src/lib/games/${id}/static`, './static', { overwrite: true });
  try {
    const manifest = await fse.readJson('./static/manifest.json');
    if (manifest.icons)
      manifest.icons = manifest.icons.map((icon) => ({
        ...icon,
        src: urlJoin(basePath, icon.src),
      }));
    if (manifest.start_url) manifest.start_url = basePath || '.';
    if (manifest.screenshots)
      manifest.screenshots = manifest.screenshots.map((screenshot) => ({
        ...screenshot,
        src: urlJoin(basePath, screenshot.src),
      }));
    if (manifest.file_handlers) {
      manifest.file_handlers = manifest.file_handlers.map((handler) => {
        const icons = handler.icons.map((icon) => ({ ...icon, src: urlJoin(basePath, icon.src) }));
        const action = basePath || '.';
        return { ...handler, icons, action };
      });
    }
    await fse.writeFile('./static/manifest.json', JSON.stringify(manifest, null, 2));
  } catch (e) {
    console.log(clc.red('[Error]: There was an error updating the manifest'));
    console.error(e);
    process.exit(1);
  }
}
