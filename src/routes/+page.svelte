<script lang="ts">
  import AppBackground from '$cmp/theme/AppBackground.svelte';
  import HomePage from '$cmp/shell/HomePage.svelte';

  // '/' IS THE HOME SCREEN. It used to be a byte-for-byte duplicate of routes/player/+page.svelte
  // (the root was the player twice over) with the home screen floating over it as a popup; the
  // player now lives at exactly one route, /player. The PWA manifest's start_url ('.') is
  // deliberately unchanged - an installed app launching into home is the point.
  //
  // NO setPageVisited() HERE, unlike the player page this replaced: PAGES_VERSIONS has no 'home'
  // entry to mark. That store's whole job is the "new!" badge - a page marks itself visited so its
  // own changelog stops being announced. Home has no changelog of its own; the badges it renders
  // belong to the pages it links to, each of which marks itself when opened.
</script>

<AppBackground page="Main">
  <HomePage />
</AppBackground>
