<script lang="ts">
  import { onMount } from 'svelte';
  import isMobile from 'is-mobile';
  import { asyncPromptStore } from '$stores/AsyncPromptStore.svelte';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { t } from '$i18n/binding.svelte';
  import DecoratedCard from '../layout/DecoratedCard.svelte';

  // One file renders both dialogs (confirm + free-text prompt) directly
  // against asyncPromptStore's state, rather than splitting into
  // sub-components - Svelte can't export two named components per file.
  //
  // Uses its own <svelte:window onkeydown> (below) rather than routing
  // through KeyboardProvider.register(...) like other global shortcuts -
  // simpler than standing up two more register/unregister pairs in a
  // component that already runs its own overlay-click and blur effects.
  //
  // `ignore_click_outside` (below, on both dialogs) is read by other
  // components' `use:clickOutside` actions (see clickOutside.ts's
  // hasFocusable) - it's what lets a click landing inside this dialog NOT
  // count as an "outside" click for whatever else is open.

  onMount(() => {
    return () => {
      asyncPromptStore.clearAll();
    };
  });

  const promptState = asyncPromptStore.promptState;
  const confirmState = asyncPromptStore.confirmState;

  // ---- Confirm dialog ----
  let confirmIsMounted = $state(false);
  $effect(() => {
    if (confirmState.deferred) {
      confirmIsMounted = true;
      return;
    }
    // demount after animation ended
    const timeout = setTimeout(() => {
      confirmIsMounted = false;
    }, 300);
    return () => clearTimeout(timeout);
  });
  $effect(() => {
    if (!confirmState.deferred) return;
    const activeEl = document.activeElement as HTMLElement | null;
    activeEl?.blur();
  });

  function handleConfirmOverlayClick(e: MouseEvent) {
    if (e.target !== e.currentTarget || !confirmState.cancellable) return;
    asyncPromptStore.answerConfirm(null);
  }

  function handleConfirmKeydown(e: KeyboardEvent) {
    if (!confirmState.deferred) return;
    if (e.key === 'Escape' && confirmState.cancellable) asyncPromptStore.answerConfirm(null);
    if (e.key === 'Enter') asyncPromptStore.answerConfirm(true);
  }

  // ---- Prompt dialog ----
  let promptIsMounted = $state(false);
  let value = $state('');
  let inputEl: HTMLInputElement | undefined = $state();
  const color = $derived(ThemeProvider.layer('primary', 0.1).toString());

  $effect(() => {
    if (promptState.deferred) {
      promptIsMounted = true;
      return;
    }
    // demount after animation ended
    const timeout = setTimeout(() => {
      promptIsMounted = false;
    }, 200);
    return () => clearTimeout(timeout);
  });
  $effect(() => {
    void promptState.deferred;
    value = '';
  });
  $effect(() => {
    if (isMobile() || !promptState.deferred) return;
    // focus element once it's visible
    const timeout = setTimeout(() => inputEl?.focus(), 300);
    return () => clearTimeout(timeout);
  });

  function handlePromptOverlayClick(e: MouseEvent) {
    if (e.target !== e.currentTarget || !promptState.cancellable) return;
    asyncPromptStore.answerPrompt(null);
  }

  function handlePromptKeydown(e: KeyboardEvent) {
    if (!promptState.deferred) return;
    if (e.key === 'Enter' && value) asyncPromptStore.answerPrompt(value);
    if (e.key === 'Escape' && promptState.cancellable) asyncPromptStore.answerPrompt(null);
  }

  // Fires unconditionally (no `deferred` gate - the input can only be
  // focused while the dialog is visible anyway) so Enter/Escape still work
  // while the input itself has focus, even while handleWindowKeydown below
  // is suppressed for as long as this input is focused.
  function handlePromptInputKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && value) asyncPromptStore.answerPrompt(value);
    if (e.key === 'Escape' && promptState.cancellable) asyncPromptStore.answerPrompt(null);
  }

  // `<svelte:window>` can only appear once per component and must be
  // top-level, so a single listener stays attached for this component's
  // whole lifetime; each handler below guards itself on its own dialog's
  // `deferred` state instead of being conditionally mounted.
  function handleWindowKeydown(e: KeyboardEvent) {
    // Global guard: bails whenever ANY <input> anywhere is focused, not
    // just this dialog's own - handlePromptInputKeydown above is what
    // still handles Enter/Escape while the prompt's own input has focus.
    if (document.activeElement?.tagName === 'INPUT') return;
    handleConfirmKeydown(e);
    handlePromptKeydown(e);
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!--
    The two overlay divs below are click-to-cancel backdrops, not independent controls: their
    only interactive purpose is dismissing the dialog on an outside click, and that action is
    already fully keyboard-reachable via the window Escape handler above plus the explicit
    No/Cancel buttons inside. Giving a full-viewport backdrop its own role="button"/tabindex (the
    fix svelte-check suggests, and the one DecoratedCard applies for its own onclick)
    would be a real a11y regression here, not an improvement: it would insert a screen-reader-
    focusable stop the size of the whole screen ahead of the actual dialog content. Suppressing
    both rules is therefore the deliberate, correct call for this specific "backdrop" pattern -
    same treatment mainstream accessible modal implementations (e.g. Radix/Headless UI dialogs)
    give their overlay element.
-->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  style={!confirmIsMounted ? 'display:none' : ''}
  onclick={handleConfirmOverlayClick}
  class={[
    'prompt-overlay',
    'ignore_click_outside',
    !confirmState.deferred && 'prompt-overlay-hidden',
  ]}
>
  <DecoratedCard
    class={[
      'floating-prompt',
      'ignore_click_outside',
      !confirmState.deferred && 'floating-prompt-hidden',
    ]}
    isRelative={false}
    size="1.1rem"
  >
    <div style="white-space:pre-wrap">{confirmState.question}</div>
    <div class="prompt-row">
      <button
        class="prompt-button"
        style="background-color:rgb(169, 82, 90);color:white"
        onclick={() => asyncPromptStore.answerConfirm(false)}
      >
        {t('common:no')}
      </button>
      <button
        class="prompt-button"
        style="background-color:rgb(98, 140, 131);color:white"
        onclick={() => asyncPromptStore.answerConfirm(true)}
      >
        {t('common:yes')}
      </button>
    </div>
  </DecoratedCard>
</div>

<!-- Same backdrop pattern/reasoning as the confirm overlay above. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  style={!promptIsMounted ? 'display:none' : ''}
  onclick={handlePromptOverlayClick}
  class={[
    'prompt-overlay',
    'ignore_click_outside',
    !promptState.deferred && 'prompt-overlay-hidden',
  ]}
>
  <DecoratedCard
    class={[
      'floating-prompt',
      'ignore_click_outside',
      !promptState.deferred && 'floating-prompt-hidden',
    ]}
    isRelative={false}
    size="1.1rem"
  >
    <div style="white-space:pre-wrap">{promptState.question}</div>
    <input
      bind:this={inputEl}
      class="prompt-input"
      bind:value
      onkeydown={handlePromptInputKeydown}
    />
    <div class="prompt-row">
      <!-- QUIRK: Cancel/Ok below are literal English, unlike the
                 confirm dialog's Yes/No above (t('common:yes')/t('common:no')) -
                 this dialog was never wired to i18n. Not something to
                 translate as a "fix". -->
      <button
        class="prompt-button"
        style="background-color:{color};color:white"
        onclick={() => asyncPromptStore.answerPrompt(null)}
      >
        Cancel
      </button>
      <button
        class={['prompt-button', !value && 'disabled']}
        disabled={!value}
        style="background-color:{color};color:white"
        onclick={() => asyncPromptStore.answerPrompt(value)}
      >
        Ok
      </button>
    </div>
  </DecoratedCard>
</div>
