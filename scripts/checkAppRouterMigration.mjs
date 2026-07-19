import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';

const [mode, outputDirectory] = process.argv.slice(2);
const projectRoot = process.cwd();

const sourceWrappers = [
    'src/app/layout.tsx', 'src/app/providers.tsx', 'src/app/global-error.tsx', 'src/app/not-found.tsx',
    'src/app/page.tsx', 'src/app/player/page.tsx', 'src/app/backup/page.tsx', 'src/app/blog/page.tsx',
    'src/app/blog/posts/add-to-home-screen/page.tsx', 'src/app/blog/posts/connect-midi-device/page.tsx',
    'src/app/blog/posts/easyplay-1s/page.tsx', 'src/app/blog/posts/how-to-use-composer/page.tsx',
    'src/app/blog/posts/how-to-use-player/page.tsx', 'src/app/blog/posts/how-to-use-vsrg-composer/page.tsx',
    'src/app/blog/posts/midi-transpose/page.tsx', 'src/app/blog/posts/video-audio-transpose/page.tsx',
    'src/app/changelog/page.tsx', 'src/app/composer/page.tsx', 'src/app/delete-cache/page.tsx',
    'src/app/donate/page.tsx', 'src/app/error/page.tsx', 'src/app/keybinds/page.tsx',
    'src/app/partners/page.tsx', 'src/app/privacy/page.tsx', 'src/app/sheet-visualizer/page.tsx',
    'src/app/theme/page.tsx', 'src/app/transfer/page.tsx', 'src/app/uma-mode/page.tsx',
    'src/app/vsrg-composer/page.tsx', 'src/app/vsrg-player/page.tsx', 'src/app/zen-keyboard/page.tsx',
];

const exportedRoutes = [
    'index.html', 'player.html', 'backup.html', 'blog.html',
    'blog/posts/add-to-home-screen.html', 'blog/posts/connect-midi-device.html',
    'blog/posts/easyplay-1s.html', 'blog/posts/how-to-use-composer.html',
    'blog/posts/how-to-use-player.html', 'blog/posts/how-to-use-vsrg-composer.html',
    'blog/posts/midi-transpose.html', 'blog/posts/video-audio-transpose.html',
    'changelog.html', 'composer.html', 'delete-cache.html', 'donate.html', 'error.html',
    'keybinds.html', 'partners.html', 'privacy.html', 'sheet-visualizer.html', 'theme.html',
    'transfer.html', 'uma-mode.html', 'vsrg-composer.html', 'vsrg-player.html',
    'zen-keyboard.html', '404.html',
];

function filesBelow(directory) {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
        const entryPath = join(directory, entry.name);
        return entry.isDirectory() ? filesBelow(entryPath) : [entryPath];
    });
}

function fail(message) {
    console.error('App Router migration check failed: ' + message);
    process.exitCode = 1;
}

if (mode === 'source') {
    for (const file of sourceWrappers) {
        if (!existsSync(resolve(projectRoot, file))) fail('missing ' + file);
    }
    const legacyPages = filesBelow(resolve(projectRoot, 'src/pages'))
        .filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));
    if (legacyPages.length > 0) {
        fail('legacy route source remains: ' + legacyPages.map((file) => relative(projectRoot, file)).join(', '));
    }
    const routerImports = filesBelow(resolve(projectRoot, 'src'))
        .filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file))
        .filter((file) => /from\s+['"]next\/(?:router|head)['"]/.test(readFileSync(file, 'utf8')));
    if (routerImports.length > 0) {
        fail('unsupported Pages Router imports remain: ' + routerImports.map((file) => relative(projectRoot, file)).join(', '));
    }
} else if (mode === 'export') {
    if (!outputDirectory) {
        fail('provide the exported directory, for example: node scripts/checkAppRouterMigration.mjs export build/genshinMusic');
    } else {
        const requestedRoot = resolve(projectRoot, outputDirectory);
        const candidateRoots = [requestedRoot, join(requestedRoot, 'out')].filter(existsSync);
        if (candidateRoots.length === 0) {
            fail('no export directory found at ' + requestedRoot);
        } else {
            for (const route of exportedRoutes) {
                const candidates = [route, route.replace(/\.html$/, '/index.html')];
                const found = candidateRoots.some((root) => candidates.some((candidate) => existsSync(join(root, candidate))));
                if (!found) fail('missing exported route ' + route);
            }
            for (const asset of ['manifest.json', 'service-worker.js']) {
                if (!candidateRoots.some((root) => existsSync(join(root, asset)))) fail('missing ' + asset);
            }
        }
    }
} else {
    fail('use source or export mode');
}

if (process.exitCode === undefined) console.log('App Router migration ' + mode + ' check passed.');
