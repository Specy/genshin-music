<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$i18n/binding.svelte';

  // THE WINDOW-WIDE FILE DROP: it hands over the dropped File objects untouched, and deciding what
  // each one is (a song sheet, one of our own MIDI exports, a file for the composer's importer) is
  // the caller's job - the file's name and bytes are what tell those apart, not a read mode picked
  // in advance. It used to read every file as JSON, which is why a dropped .mid could only ever
  // fail.
  //
  // WHETHER A DRAG IS OVER THE PAGE is counted, not flagged. Every element the pointer crosses
  // fires dragenter on the one it enters and dragleave on the one it left, so a single boolean that
  // any dragleave turned off went false on every element boundary and relied on the next dragover
  // to turn it back on. Whenever that dragover came late - an element above the overlay, a browser
  // that fires the pair in separate tasks - the overlay was destroyed and rebuilt, restarting its
  // fade-in and its glow from the top: the glow "breaking". A depth count only reaches zero when
  // the pointer has left the page. And because a dragleave can land on an element that is no longer
  // in the document (it then never bubbles to the window) and leave the count stuck above zero, a
  // watchdog ends the drag once dragover - which the browser keeps firing at least every ~550ms
  // while a drag is over the page, moving or not - has been silent for a second.
  //
  // THE OVERLAY IS ALWAYS MOUNTED and only switched on and off by a class, and hiding waits a beat:
  // a momentary flip can then neither rebuild it nor restart its animation.
  //
  // A DRAG WITHOUT FILES - a link or text from another window - is swallowed everywhere but a text
  // field, as every drop always was here. Left to the browser, a link dropped on the page navigates
  // the tab to it, leaving the app with whatever was unsaved (the player has no leave guard). A text
  // field is the one place such a drop means something, so there the browser inserts it as usual.
  let {
    onDrop,
    showDropArea = false,
  }: {
    onDrop: (files: File[]) => void;
    showDropArea?: boolean;
  } = $props();

  /** Longer than the longest gap the browser leaves between two dragovers over the page. */
  const DRAG_WATCHDOG_MS = 1000;
  /** How long a drag must stay gone before the overlay goes: absorbs a leave/enter pair. */
  const HIDE_DELAY_MS = 60;

  let isHovering = $state(false);
  let depth = 0;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  function hasFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes('Files') ?? false;
  }

  function isTextField(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])') !== null
    );
  }

  /** Cancelling dragover AND drop is what stops the browser navigating to a dropped link. */
  function swallowDropWithoutFiles(event: DragEvent) {
    if (!isTextField(event.target)) event.preventDefault();
  }

  function show() {
    clearTimeout(hideTimer);
    hideTimer = undefined;
    isHovering = true;
  }

  function scheduleHide() {
    if (hideTimer !== undefined) return;
    hideTimer = setTimeout(() => {
      hideTimer = undefined;
      isHovering = false;
    }, HIDE_DELAY_MS);
  }

  function armWatchdog() {
    clearTimeout(watchdog);
    watchdog = setTimeout(endDrag, DRAG_WATCHDOG_MS);
  }

  function endDrag() {
    depth = 0;
    clearTimeout(watchdog);
    watchdog = undefined;
    scheduleHide();
  }

  function handleDragEnter(event: DragEvent) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth++;
    show();
    armWatchdog();
  }

  function handleDragOver(event: DragEvent) {
    if (!hasFiles(event)) return swallowDropWithoutFiles(event);
    // Without this the browser refuses the drop (and opens the file in the tab instead).
    event.preventDefault();
    // A drag that started outside a frame we listen in can arrive without an enter of its own.
    if (depth === 0) depth = 1;
    show();
    armWatchdog();
  }

  function handleDragLeave(event: DragEvent) {
    if (!hasFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) endDrag();
  }

  function handleDrop(event: DragEvent) {
    if (!hasFiles(event)) return swallowDropWithoutFiles(event);
    event.preventDefault();
    endDrag();
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) onDrop(files);
  }

  onMount(() => {
    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    return () => {
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      clearTimeout(watchdog);
      clearTimeout(hideTimer);
    };
  });
</script>

{#if showDropArea}
  <div class={['drop-overlay', isHovering && 'drop-overlay-shown']} aria-hidden={!isHovering}>
    {t('home:drop_files_here')}
  </div>
{/if}

<style>
  /* HIDDEN: out of hit-testing and invisible, after the fade-out has run (visibility is delayed by
     the fade's own length, so it does not cut the fade short). */
  .drop-overlay {
    position: fixed;
    inset: 0;
    /* above every page and its popups, below the toasts (998/999) and the prompts (1000) */
    z-index: 997;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 2rem;
    color: var(--accent-text);
    background-color: rgba(var(--accent-rgb), 0.6);
    backdrop-filter: blur(4px);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 0.2s ease-in,
      visibility 0s linear 0.2s;
  }

  /* SHOWN: hit-testable on purpose - with the overlay under the pointer, most of the screen is one
     element, so the drag crosses far fewer boundaries than over the page it covers. */
  .drop-overlay-shown {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition:
      opacity 0.15s ease-out,
      visibility 0s;
  }

  /* THE GLOW: a primary-coloured haze breathing in from the edges over the accent wash. Only its
     OPACITY animates, from literal values: that is composited, so the page under the blur is not
     repainted every frame (animating the wash's background-colour was), and a var() inside
     composited keyframes is exactly what Chrome gets wrong at the animation's edges - so the
     colours live in the static rule. Paused while hidden rather than removed, so showing it again
     resumes the breath instead of restarting it. */
  .drop-overlay::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow:
      inset 0 0 0 0.2rem rgba(var(--accent-rgb), 0.9),
      inset 0 0 8rem 1.5rem rgba(var(--primary-rgb), 0.85);
    opacity: 0.35;
    animation: drop-glow 1.5s ease-in-out infinite alternate;
    animation-play-state: paused;
  }

  .drop-overlay-shown::before {
    animation-play-state: running;
  }

  @keyframes drop-glow {
    from {
      opacity: 0.35;
    }
    to {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .drop-overlay::before {
      animation: none;
      opacity: 0.7;
    }
  }
</style>
