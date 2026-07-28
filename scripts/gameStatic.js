import fse from 'fs-extra';
import urlJoin from 'url-join';
import clc from 'cli-color';

/**
 * Copy src/lib/games/<id>/static into static/ (gitignored overlay paths)
 * and rewrite static/manifest.json for the given base path.
 * Mirrors the old public/-copy + updateManifest behavior byte-for-byte.
 */
export async function prepareGameStatic(id, basePath) {
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
