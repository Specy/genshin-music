# App Router Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the Pages Router with an App Router route surface while retaining the fully static Sky/Genshin web application, all browser-side behavior, Serwist, and Pixi rendering.

**Architecture:** Keep public App Router files small and server-rendered at build time. Move the former page implementations into src/app/_client-pages/, a private folder that mirrors the old tree, and import each Client Component from a server page.tsx wrapper. A root client provider retains the current shell; a small navigation context replaces router.events for supported in-app navigation.

**Tech Stack:** Next.js 16.2.9, React 19.2.7, TypeScript 6.0.3, Serwist 9.5.11, pixi.js 8.19.0, @pixi/react 8.0.5, Sass, MobX.

## Global Constraints

- Preserve output: export, next build --webpack, BUILD_PATH, NEXT_PUBLIC_BASE_PATH, and the Sky/Genshin build scripts exactly.
- Do not alter src-tauri/, Tauri scripts, audio/Pixi behavior, stores, persisted data, or visual design except where App Router compatibility requires it.
- Preserve the user's current unstaged changes in next-env.d.ts, package.json, package-lock.json, public/manifest.json, src/pages/composer/index.tsx, and src/pages/vsrg-composer/index.tsx; do not stage them as unrelated work.
- Use next/navigation, not next/router, in the final route surface. Do not add a browser-history or popstate monkeypatch.
- Remove next/head usage. Use App Router metadata for build-time defaults and native React title/meta elements for client-only metadata updates.
- Keep Pixi canvases behind their current dynamic(..., { ssr: false }) boundaries and retain renderer-resize behavior.
- New TypeScript must use explicit types and must not introduce any or broad type assertions.
- The former pages/404 visual UI becomes app/not-found.tsx; do not create a normal app/404/page.tsx, because static export has one 404.html artifact.
- Use apply_patch for source edits. Before generated-build verification, back up and restore the user-owned public/manifest.json and next-env.d.ts files.

---

## File structure locked by this plan

### New framework and validation files

| File | Responsibility |
| --- | --- |
| src/app/layout.tsx | Root HTML/body, global styles, default metadata, analytics, providers. |
| src/app/providers.tsx | Client provider tree and the _app.tsx browser effects. |
| src/app/site-metadata.ts | Sky/Genshin root Metadata and Viewport builders. |
| src/app/global-error.tsx | Framework-level fallback for failures above the client shell. |
| src/app/not-found.tsx | Static-host 404 fallback using the former pages/404 UI. |
| src/app/_navigation/NavigationProvider.tsx | Single registered asynchronous leave handler plus guarded push/replace/back operations. |
| src/app/_navigation/AppLink.tsx | Internal App Router link that delegates navigation through the provider. |
| src/app/_navigation/types.ts | Navigation types shared by the provider and editor adapters. |
| scripts/checkAppRouterMigration.mjs | Source-tree and exported-artifact assertions. |

### Route implementation move

Move src/pages/ to src/app/_client-pages/ with git mv after verifying the resolved source and destination are both inside the repository. Delete the moved _app.tsx, _document.tsx, and root index.tsx; their behavior is replaced by the root layout/providers and the root wrapper imports the Player implementation directly.

Every remaining entry module in the private tree begins with use client. The public wrapper files are exactly:

| App wrapper | Client implementation import |
| --- | --- |
| src/app/page.tsx | $pages/player |
| src/app/player/page.tsx | $pages/player |
| src/app/backup/page.tsx | $pages/backup |
| src/app/blog/page.tsx | $pages/blog |
| src/app/blog/posts/add-to-home-screen/page.tsx | $pages/blog/posts/add-to-home-screen |
| src/app/blog/posts/connect-midi-device/page.tsx | $pages/blog/posts/connect-midi-device |
| src/app/blog/posts/easyplay-1s/page.tsx | $pages/blog/posts/easyplay-1s |
| src/app/blog/posts/how-to-use-composer/page.tsx | $pages/blog/posts/how-to-use-composer |
| src/app/blog/posts/how-to-use-player/page.tsx | $pages/blog/posts/how-to-use-player |
| src/app/blog/posts/how-to-use-vsrg-composer/page.tsx | $pages/blog/posts/how-to-use-vsrg-composer |
| src/app/blog/posts/midi-transpose/page.tsx | $pages/blog/posts/midi-transpose |
| src/app/blog/posts/video-audio-transpose/page.tsx | $pages/blog/posts/video-audio-transpose |
| src/app/changelog/page.tsx | $pages/changelog |
| src/app/composer/page.tsx | $pages/composer |
| src/app/delete-cache/page.tsx | $pages/delete-cache |
| src/app/donate/page.tsx | $pages/donate |
| src/app/error/page.tsx | $pages/error |
| src/app/keybinds/page.tsx | $pages/keybinds |
| src/app/partners/page.tsx | $pages/partners |
| src/app/privacy/page.tsx | $pages/privacy |
| src/app/sheet-visualizer/page.tsx | $pages/sheet-visualizer |
| src/app/theme/page.tsx | $pages/theme |
| src/app/transfer/page.tsx | $pages/transfer |
| src/app/uma-mode/page.tsx | $pages/uma-mode |
| src/app/vsrg-composer/page.tsx | $pages/vsrg-composer |
| src/app/vsrg-player/page.tsx | $pages/vsrg-player |
| src/app/zen-keyboard/page.tsx | $pages/zen-keyboard |

Change the TypeScript $pages/* alias from pages/* to app/_client-pages/*. Relative page styles and the pre-existing $pages imports then continue to resolve without a mechanical import rewrite.

---

### Task 1: Add executable migration contracts

**Files:**

- Create: scripts/checkAppRouterMigration.mjs

**Interfaces:**

- Produces: node scripts/checkAppRouterMigration.mjs source, which verifies the final source tree.
- Produces: node scripts/checkAppRouterMigration.mjs export output-directory, which verifies exported HTML routes and PWA assets.
- Consumes later: the exact route wrapper paths listed above.

- [x] **Step 1: Write the failing source-tree contract**

Create scripts/checkAppRouterMigration.mjs. It intentionally fails before the cutover because the App Router wrappers do not yet exist and src/pages still contains route files.

~~~
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

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
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
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
    fail('provide the exported directory, for example: npm run check:static-export -- build/genshinMusic');
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
~~~

- [x] **Step 2: Run the contract before implementation**

Run:

~~~powershell
node scripts/checkAppRouterMigration.mjs source
~~~

Expected: non-zero exit with missing src/app wrappers and legacy src/pages route source. This proves the contract detects the pre-migration state.

- [x] **Step 3: Commit only the contract file**

~~~powershell
git add -- scripts/checkAppRouterMigration.mjs
git commit -m "test: add app router migration contracts"
~~~

Do not modify or stage package.json or package-lock.json. The existing working-tree line-ending changes in those files are user-owned and no dependency or script change is needed for this migration.

### Task 2: Build the guarded App Router navigation seam

**Files:**

- Create: src/app/_navigation/types.ts
- Create: src/app/_navigation/NavigationProvider.tsx
- Create: src/app/_navigation/AppLink.tsx
- Modify: src/components/shared/link/AppLink.tsx

**Interfaces:**

- NavigationProvider exposes one registered asynchronous leave handler. Registering a new handler replaces the previous handler; its cleanup only clears that same handler.
- AppLink accepts only a string internal href, lets Next handle ordinary link mechanics, and delegates an actual in-app navigation to the provider.
- The existing styled shared AppLink remains the component imported by content pages, but renders the guarded navigation primitive.

- [x] **Step 1: Add explicit navigation types**

Create src/app/_navigation/types.ts:

~~~
export type NavigationTarget = string | '__back__';

export type LeaveHandler = (target: NavigationTarget) => Promise<boolean>;

export type NavigationOptions = {
  scroll?: boolean;
  bypassLeaveHandler?: boolean;
};

export type AppNavigation = {
  push: (href: string, options?: NavigationOptions) => Promise<boolean>;
  replace: (href: string, options?: NavigationOptions) => Promise<boolean>;
  back: () => Promise<boolean>;
  pushWithoutGuard: (
    href: string,
    options?: Omit<NavigationOptions, 'bypassLeaveHandler'>,
  ) => void;
  registerLeaveHandler: (handler: LeaveHandler) => () => void;
};
~~~

- [x] **Step 2: Implement the client provider**

Create src/app/_navigation/NavigationProvider.tsx with a React context and a useAppNavigation hook. Use useRouter from next/navigation. Keep the active handler in one ref, call it before push, replace, or back, and only mutate browser history when it resolves true. PushWithoutGuard is the error-boundary escape hatch and must not call the handler.

The implementation must follow this behavior:

~~~
const handlerRef = useRef<LeaveHandler | null>(null);

const canLeave = useCallback(async (target: NavigationTarget) => {
  const handler = handlerRef.current;
  return handler === null ? true : handler(target);
}, []);

const push = useCallback(async (href: string, options: NavigationOptions = {}) => {
  const mayNavigate = options.bypassLeaveHandler || await canLeave(href);
  if (!mayNavigate) return false;
  router.push(href, {scroll: options.scroll});
  return true;
}, [canLeave, router]);

const registerLeaveHandler = useCallback((handler: LeaveHandler) => {
  handlerRef.current = handler;
  return () => {
    if (handlerRef.current === handler) handlerRef.current = null;
  };
}, []);
~~~

Implement replace and back with the same rule. Export NavigationProvider, which takes ReactNode children, and useAppNavigation, which throws a descriptive Error outside the provider.

- [x] **Step 3: Implement the guarded App Router link**

Create src/app/_navigation/AppLink.tsx as a Client Component. Use next/link and ComponentProps<typeof NextLink> to derive the supported anchor props without adding broad types. Its props are the Next link props except href and onNavigate, plus:

~~~
type AppLinkProps = Omit<ComponentProps<typeof NextLink>, 'href' | 'onNavigate'> & {
  href: string;
  onNavigate?: NonNullable<ComponentProps<typeof NextLink>['onNavigate']>;
};
~~~

On Next onNavigate, call event.preventDefault, call the caller-provided handler if present, then call navigation.replace when replace is true or navigation.push otherwise. Pass the incoming scroll option. Leave normal link rendering, prefetching, modified-click behavior, target behavior, and accessibility to Next Link.

- [x] **Step 4: Adapt the shared styled link**

Change src/components/shared/link/AppLink.tsx to import the navigation primitive instead of next/link. Derive its public props from the primitive and retain the exact existing inline display, underline, accent color, and caller style merge. It must not accept object href values; convert the one existing object href call site to a string when updating navigation consumers in Task 3.

- [x] **Step 5: Type-check the seam before route conversion**

Run:

~~~powershell
npx tsc --noEmit
~~~

Expected before Task 3: the navigation seam compiles while Pages Router sources remain unchanged. Do not try to make the source-tree contract pass yet.

- [x] **Step 6: Commit the isolated seam**

~~~powershell
git add -- src/app/_navigation src/components/shared/link/AppLink.tsx
git commit -m "feat: add guarded app navigation"
~~~

Do not include user-owned package or generated-manifest changes.

### Task 3: Cut over the route tree, shell, metadata, and consumers

**Files:**

- Move: src/pages to src/app/_client-pages
- Create: src/app/layout.tsx, src/app/providers.tsx, src/app/site-metadata.ts, src/app/global-error.tsx, src/app/not-found.tsx, src/app/_components/PageBackground.tsx, and every public page.tsx wrapper listed above.
- Modify: tsconfig.json, src/components/AppBase.tsx, src/components/shared/Miscellaneous/PageMetadata.tsx, src/components/shared/ProviderWrappers/ThemeProviderWrapper.tsx, src/components/shared/Utility/ErrorBoundaryRedirect.tsx, all router consumers, and all same-origin direct next/link consumers.
- Delete after no references remain: the routeChangeBugFix export and its stale import sites.

- [x] **Step 1: Move the Pages Router implementation without losing user changes**

Resolve the source and destination first and ensure both are inside the repository. Create src/app if needed, then use git mv to relocate src/pages as src/app/_client-pages. The move carries the user-modified composer and vsrg-composer entries forward unchanged.

Delete the moved _app.tsx, _document.tsx, and root index.tsx using apply_patch. Do not delete CSS, Sass, or page implementation files.

Change the $pages/* tsconfig alias to app/_client-pages/*. Add a leading use client directive to every remaining private entry:

~~~
404/index.tsx
backup/index.tsx
blog/index.tsx
blog/posts/add-to-home-screen.tsx
blog/posts/connect-midi-device.tsx
blog/posts/easyplay-1s.tsx
blog/posts/how-to-use-composer.tsx
blog/posts/how-to-use-player.tsx
blog/posts/how-to-use-vsrg-composer.tsx
blog/posts/midi-transpose.tsx
blog/posts/video-audio-transpose.tsx
changelog/index.tsx
composer/index.tsx
delete-cache/index.tsx
donate/index.tsx
error/index.tsx
keybinds/index.tsx
partners/index.tsx
player/index.tsx
privacy/index.tsx
sheet-visualizer/index.tsx
theme/index.tsx
transfer/index.tsx
uma-mode/index.tsx
vsrg-composer/index.tsx
vsrg-player/index.tsx
zen-keyboard/index.tsx
~~~

- [x] **Step 2: Recreate the global shell as App Router files**

Create src/app/site-metadata.ts using only process.env values, not src/Config.ts. Export rootMetadata and rootViewport typed as Metadata and Viewport. The values must preserve:

- title: Sky Music Nightly or Genshin Music Nightly;
- the existing product description for the selected app;
- favicon, apple touch icon, and manifest URLs prefixed by NEXT_PUBLIC_BASE_PATH;
- noindex and nofollow robots only when NEXT_PUBLIC_IS_BETA is true;
- width=device-width, initialScale=1, minimumScale=1, maximumScale=1, userScalable=false, and themeColor=#63aea7.

Create src/app/layout.tsx as a Server Component. It imports all former _app global styles once, renders html lang=en and body, supplies rootMetadata and rootViewport, renders GoogleAnalyticsScript, and wraps children in Providers.

Create src/app/providers.tsx as a Client Component. Preserve the three existing browser effects from _app.tsx exactly in behavior: console-error capture/restoration, window error logging, virtual-keyboard setup plus Serwist update registration. Replace the old Page Router composition with:

~~~
<ThemeProviderWrapper>
  <DropZoneProviderWrapper>
    <GeneralProvidersWrapper>
      <NavigationProvider>
        <ErrorBoundaryRedirect
          onErrorGoTo="/error"
          onError={() => logger.error(i18n.t('logs:error_with_the_app'))}
        >
          <>
            <AppBase />
            {children}
          </>
        </ErrorBoundaryRedirect>
      </NavigationProvider>
    </GeneralProvidersWrapper>
  </DropZoneProviderWrapper>
</ThemeProviderWrapper>
~~~

Use explicit local types for browser extensions rather than adding new ts-ignore or any values.

Create src/app/_components/PageBackground.tsx as a Client Component around the existing AppBackground. Its page prop is the existing Composer or Main union and it renders ReactNode children. This lets server wrappers preserve the five former getLayout backgrounds without making every wrapper a Client Component.

Create src/app/global-error.tsx as a Client Component with html and body. Its props are error: Error and unstable_retry: () => void. Log the error in an effect and render a small accessible fallback with a retry button that invokes unstable_retry.

Create src/app/not-found.tsx as a Server Component that imports the former 404 implementation from $pages/404. This is the only custom 404 route, so static export emits one 404.html artifact.

- [x] **Step 3: Replace Pages Router head and router APIs**

Apply these exact replacements:

- In PageMetadata, remove next/head. Return a fragment containing title plus native meta tags for description, og:description, image, and og:image, preserving children in the same fragment.
- In ThemeProviderWrapper, replace its Head-wrapped theme-color tag with a native meta tag. Keep its style variable behavior intact.
- In AppBase, remove next/router. Use usePathname and useSearchParams from next/navigation to form the current page title value. Track Analytics page views and browserHistoryStore additions in an effect keyed by pathname and serialized search parameters. Preserve initial page tracking and do not reintroduce router.events.
- In ErrorBoundaryRedirect, remove next/router and routeChangeBugFix. Wrap the class with a function that reads pushWithoutGuard from useAppNavigation. Type componentDidCatch with Error and ErrorInfo, invoke onError, retain the localhost no-redirect behavior, and navigate to onErrorGoTo only through pushWithoutGuard.
- In Home, PlayerMenu, SheetVisualizerMenu, and SimpleMenu, replace useRouter with useAppNavigation or next/navigation only where required. Visible Back actions must call the guarded navigation.back. Preserve the external Discord/specy.app confirmation flows as normal anchors and window.open behavior.
- Replace every same-origin direct next/link import in these files with the guarded navigation AppLink:
  - src/components/pages/blog/BaseBlogPost.tsx
  - src/components/pages/blog/BlogUl.tsx
  - src/components/pages/Composer/ComposerMenu.tsx
  - src/components/pages/Index/Home.tsx
  - src/components/pages/Player/PlayerMenu.tsx
  - src/components/pages/Promotion/PromotionCard.tsx
  - src/components/pages/VsrgPlayer/VsrgPlayerMenu.tsx
  - src/components/shared/Miscellaneous/DonateButton.tsx
  - src/components/shared/pagesLayout/SimpleMenu.tsx
  - src/app/_client-pages/404/index.tsx
  - src/app/_client-pages/backup/index.tsx
  - src/app/_client-pages/blog/index.tsx
  - src/app/_client-pages/changelog/index.tsx
  - src/app/_client-pages/partners/index.tsx

Convert the PlayerMenu object href to its equivalent encoded string path and query. Do not migrate external links to the internal guarded link.

- [x] **Step 4: Adapt Composer and VSRG Composer to the leave-handler seam**

In each moved editor entry:

1. Replace NextRouter props and the router.events unblock field with AppNavigation and registerLeaveHandler props.
2. Use useSearchParams in the functional Composer wrapper to read songId and showMidi. Pass navigation and registerLeaveHandler from useAppNavigation.
3. Keep the existing beforeunload protection in Composer.
4. Register one prepareToLeave function in componentDidMount and keep its unregister callback for componentWillUnmount.
5. Make changePage call navigation.push only after its Home special case; do not prompt twice.
6. Remove routeChangeError throws and routeChangeBugFix calls.

Composer prepareToLeave must preserve the existing save semantics:

~~~
prepareToLeave = async (): Promise<boolean> => {
  const {song, settings} = this.state;
  if (this.changes === 0) return true;
  if (settings.autosave.value) return this.updateSong(song);

  const shouldSave = await asyncConfirm(
    this.props.t('question:unsaved_song_save', {song_name: song.name}),
    true,
  );
  if (shouldSave === null) return false;
  if (!shouldSave) return true;
  return this.updateSong(song);
};
~~~

VSRG Composer follows the same prompt behavior and returns true only when its saveSong call succeeds. The approved guard scope is app-controlled internal links, programmatic navigation, and visible Back buttons; browser toolbar Back and Forward remain unguarded.

After the conversions, run rg for routeChangeBugFix. Delete the helper from Utilities only if the search has no remaining references.

- [x] **Step 5: Add small server wrappers for every route**

Create the 27 public wrappers in the table above. Ordinary wrappers use this shape:

~~~
import ClientPage from '$pages/privacy';

export const metadata = {
  title: 'Privacy',
  description: 'Privacy policy for the app',
};

export default function PrivacyPage() {
  return <ClientPage />;
}
~~~

The root and player wrappers render Player inside PageBackground with page=Main. Composer and vsrg-composer render their client implementations inside PageBackground with page=Composer. Vsrg-player and zen-keyboard render inside PageBackground with page=Main. The remaining wrappers directly render their private client page.

Keep literal server metadata on Privacy and add simple literal title/description metadata to static pages when the content is already known. Dynamic localized titles remain in PageMetadata and must continue to update after hydration.

- [x] **Step 6: Run deterministic source checks before building**

Run:

~~~powershell
node scripts/checkAppRouterMigration.mjs source
rg -n "from ['\"]next/(router|head)['\"]" src
rg -n "routeChangeBugFix" src
npx tsc --noEmit
~~~

Expected: the migration contract passes; the two rg checks find no matches; TypeScript compiles. If a check fails, correct the App Router conversion rather than weakening the contract.

- [x] **Step 7: Commit the atomic route cutover**

~~~powershell
git add -- src/app src/components src/lib/utils/Utilities.ts tsconfig.json
git add -u -- src/pages
git commit -m "refactor: migrate static site to app router"
~~~

Before committing, inspect git diff --cached --stat and git diff --cached. Include the user’s composer and vsrg-composer edits only because their files were moved as part of this explicitly authorized migration. Exclude next-env.d.ts, package.json, package-lock.json, public/manifest.json, and .claude.

### Task 4: Verify static exports and browser runtime, then hand off cleanly

**Files:**

- Generated only during verification: build/ output, public/manifest.json, and next-env.d.ts.
- Do not commit generated output or user-owned generated-file changes.

- [x] **Step 1: Re-run source and type verification**

Run the contract and type check from Task 3 once more from a clean build state:

~~~powershell
node scripts/checkAppRouterMigration.mjs source
npx tsc --noEmit
~~~

- [x] **Step 2: Protect user-owned generated files and build both products**

Use one scoped PowerShell try/finally block. It must back up the current public/manifest.json and next-env.d.ts before build scripts execute, run both existing product builds unchanged, validate each export, and restore those two user-owned files even if a build fails:

~~~powershell
$taskTemp = Join-Path ([System.IO.Path]::GetTempPath()) ('genshin-music-app-router-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $taskTemp | Out-Null
$manifestBackup = Join-Path $taskTemp 'manifest.json'
$nextEnvBackup = Join-Path $taskTemp 'next-env.d.ts'
Copy-Item -LiteralPath 'public/manifest.json' -Destination $manifestBackup
Copy-Item -LiteralPath 'next-env.d.ts' -Destination $nextEnvBackup
try {
  npm run build:sky
  node scripts/checkAppRouterMigration.mjs export build/skyMusic
  npm run build:genshin
  node scripts/checkAppRouterMigration.mjs export build/genshinMusic
} finally {
  Copy-Item -LiteralPath $manifestBackup -Destination 'public/manifest.json' -Force
  Copy-Item -LiteralPath $nextEnvBackup -Destination 'next-env.d.ts' -Force
  Remove-Item -LiteralPath $taskTemp -Recurse -Force
}
~~~

If the existing scripts place the export directly below a different configured BUILD_PATH, pass that path to the contract instead of modifying buildApp.js. Do not change the existing scripts to accommodate the check.

- [x] **Step 3: Perform a real App Router runtime smoke test**

Launch the Genshin app without the manifest-mutating helper, on an available explicit local port:

~~~powershell
$env:NEXT_PUBLIC_APP_NAME = 'Genshin'
$env:NEXT_PUBLIC_BASE_PATH = ''
npm run dev -- --port 3001
~~~

Using the browser-control workflow, visit:

- /composer and verify the dynamic Composer canvas loads after hydration;
- /vsrg-composer and verify the VSRG canvas loads after hydration;
- /vsrg-player and verify the player canvas loads after hydration;
- /privacy and one nested blog post to confirm ordinary static wrappers resolve.

Capture screenshots or browser inspection evidence for the three Pixi routes. Check the browser console/network surface for runtime exceptions. Close the dev server after the smoke test.

- [x] **Step 4: Validate migration boundaries and dirty-worktree preservation**

Run:

~~~powershell
git diff --check
git status --short
git diff --ignore-space-at-eol -- next-env.d.ts package.json package-lock.json public/manifest.json
rg -n "from ['\"]next/(router|head)['\"]" src
~~~

Expected:

- no whitespace errors;
- no remaining Pages Router or next/head imports;
- no unintended modification to next-env.d.ts, package.json, package-lock.json, or public/manifest.json beyond the user’s pre-existing line-ending state;
- .claude remains untracked and untouched;
- Tauri files are absent from the migration diff.

- [x] **Step 5: Make the final implementation commit only after all checks pass**

If the prior task commits are already present and the working tree contains only expected migration changes, stage the remaining authored plan only if documentation is desired; otherwise leave it untracked. Do not bundle user-owned dirty files into a migration commit.

Report:

- the route-tree change and navigation-guard scope;
- source/type/static-export/browser verification results;
- the known intentional limitation for browser toolbar Back and Forward;
- any remaining dirty user files, separately from migration work.
