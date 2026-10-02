<script lang="ts">
  import '$lib/css/App.css';
  import '$lib/css/Utility.scss';
  import { beforeNavigate, goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import ThemeVars from '$lib/components/theme/ThemeVars.svelte';
  import RootMetadata from '$lib/components/shell/RootMetadata.svelte';
  import Logger from '$lib/components/shell/Logger.svelte';
  import AsyncPrompt from '$lib/components/shell/AsyncPrompt.svelte';
  import BodyDropper, { type DroppedFile } from '$lib/components/utility/BodyDropper.svelte';
  import AppInit from '$lib/components/shell/AppInit.svelte';
  import Home from '$lib/components/shell/Home.svelte';
  import { fileService, type UnknownSongImport } from '$core/Services/FileService';
  import { logger } from '$stores/LoggerStore.svelte';
  import { canLeave, navigationGuard, type NavigationTarget } from '$stores/navigationGuard.svelte';
  import { appPathname } from '$lib/utils/appPathname';
  import { t } from '$i18n/binding.svelte';

  // BodyDropper is a leaf primitive with no children slot of its own, so it and the rest of the
  // provider stack sit as siblings inside ThemeVars rather than nested further. Home here is the
  // DORMANT popup variant (never auto-opened since the '/' home page took over — see the revert
  // note in HomeContent.svelte); it stays mounted only so the popup path keeps compiling.
  let { children } = $props();

  // AppLink leave-guard, wired at the shell level. SvelteKit's beforeNavigate fires for a
  // navigation that has ALREADY started and must decide SYNCHRONOUSLY whether to cancel it -
  // nav.cancel() has no effect once any await in the callback has yielded control, so an
  // "await permission, then navigate" shape (the natural one) can't work directly. The pattern
  // below instead:
  //   1. bypassOnce lets a PREVIOUSLY-APPROVED navigation, which this handler is about to
  //      re-issue via goto(), through without re-asking. Consumed (reset to false) the moment
  //      it's read, so it only ever covers the one goto() call that set it.
  //   2. If no leave handler is registered, or the navigation would unload the document anyway
  //      (tab close / external link), there's nothing to guard - let it proceed.
  //   3. Otherwise nav.cancel() FIRST (still synchronous), THEN resolve the target and await
  //      canLeave(target). If approved, set bypassOnce and re-issue via goto(nav.to.url).
  //
  // QUIRK (disclosed, not fixed): cancelling a popstate nav makes SvelteKit itself counteract
  // the browser's already-moved history position before this callback ever runs canLeave(), so
  // by the time an approved nav re-issues via goto() above, history is already back where it
  // started - goto() therefore PUSHES a new entry rather than popping. Net effect after
  // confirming Back: the user lands on the correct URL, but the history stack gains a forward
  // entry instead of shrinking. A fix routing that case through history.back() instead would
  // race SvelteKit's own restore, so it isn't attempted.
  let bypassOnce = false;
  beforeNavigate(async (nav) => {
    if (bypassOnce) {
      bypassOnce = false;
      return;
    }
    if (nav.willUnload || !navigationGuard.hasHandler) return;
    const url = nav.to?.url;
    if (!url) return;
    nav.cancel();
    const target: NavigationTarget =
      nav.type === 'popstate' ? '__back__' : appPathname(url.pathname);
    const approved = await canLeave(target);
    if (approved) {
      bypassOnce = true;
      // `url` is nav.to.url, a URL object SvelteKit already resolved for this navigation
      // (not a hand-written route string) - the lint rule only recognizes resolve()'s own
      // return type or a few literal-safe shapes, none of which a URL instance matches, so
      // it flags this even though the value is already correctly base-prefixed.
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- see comment above
      await goto(url);
    }
  });

  async function handleDrop(files: DroppedFile[]) {
    try {
      for (const file of files) {
        const data = file.data as UnknownSongImport;
        await fileService.importAndLog(data);
      }
    } catch (e) {
      console.error(e);
      logger.error('Error importing file');
    }
  }

  function handleDropError() {
    logger.error('There was an error importing the file! Was it the correct format?');
  }

  // QUIRK (load-bearing, read before touching this function): bypassOnce is set unconditionally
  // right before goto('/error') below so this specific navigation can NEVER be intercepted by
  // the leave-guard, regardless of whether a handler is registered. Without it, two things
  // break: (1) a registered handler could block the redirect outright, and (2) even an
  // eventually-approved navigation would race reset() below - beforeNavigate's own synchronous
  // nav.cancel() resolves this await goto(...) almost immediately (it doesn't wait for the
  // async canLeave() to settle), so reset() would fire before the leave-confirmation dialog has
  // even been answered, visually resetting the crashed subtree mid-prompt.
  // reset() is called only AFTER goto() resolves so the boundary re-renders with the
  // already-navigated /error route's children, not by retrying the page that just threw.
  async function handleShellError(error: unknown, reset: () => void) {
    console.error(error);
    logger.error(t('logs:error_with_the_app'));
    if (window.location.hostname === 'localhost') {
      console.error('Prevent localhost redirect');
      reset();
      return;
    }
    // See this function's header comment for why this bypass is required.
    bypassOnce = true;
    // resolve() (not a bare string) to satisfy svelte/no-navigation-without-resolve - same
    // requirement AppLink.svelte's internal hrefs already follow.
    await goto(resolve('/error'));
    reset();
  }
</script>

<ThemeVars>
  <BodyDropper showDropArea={true} onDrop={handleDrop} as="json" onError={handleDropError} />
  <Logger />
  <AsyncPrompt />
  <AppInit />
  <Home />
  <svelte:boundary onerror={handleShellError}>
    {@render children()}
  </svelte:boundary>
</ThemeVars>
<!-- RootMetadata mounts as a SIBLING after ThemeVars closes (not nested inside it) so its
     <svelte:head> content lands after both ThemeVars' own dynamic theme-color and every page's
     per-route title/description in document order - the static theme-color here must not
     precede the dynamic one. See RootMetadata.svelte's own header for the full ordering proof. -->
<RootMetadata />
