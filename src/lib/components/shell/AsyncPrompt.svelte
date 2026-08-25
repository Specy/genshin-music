<script lang="ts">
  import { onMount } from 'svelte';
  import isMobile from 'is-mobile';
  import { asyncPromptStore } from '$stores/AsyncPromptStore.svelte';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { t } from '$i18n/binding.svelte';
  import DecoratedCard from '../layout/DecoratedCard.svelte';

  // One file renders all three dialogs (confirm + free-text prompt + option
  // select) directly against asyncPromptStore's state, rather than splitting
  // into sub-components - a Svelte file can only export the one component it
  // is, so three named components would mean three files over one store.
  //
  // Uses its own <svelte:window onkeydown> (below) rather than routing
  // through KeyboardProvider.register(...) like other global shortcuts -
  // simpler than standing up more register/unregister pairs in a component
  // that already runs its own overlay-click and blur effects.
  //
  // `ignore_click_outside` (below, on every dialog) is read by other
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
  const selectState = asyncPromptStore.selectState;

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

  // ---- Select dialog ----
  let selectIsMounted = $state(false);
  $effect(() => {
    if (selectState.deferred) {
      selectIsMounted = true;
      return;
    }
    // demount after animation ended
    const timeout = setTimeout(() => {
      selectIsMounted = false;
    }, 300);
    return () => clearTimeout(timeout);
  });
  $effect(() => {
    if (!selectState.deferred) return;
    const activeEl = document.activeElement as HTMLElement | null;
    activeEl?.blur();
  });

  function handleSelectOverlayClick(e: MouseEvent) {
    if (e.target !== e.currentTarget || !selectState.cancellable) return;
    asyncPromptStore.answerSelect(null);
  }

  function handleSelectKeydown(e: KeyboardEvent) {
    if (!selectState.deferred) return;
    // No Enter default here, unlike the confirm dialog: with one button per option there is no
    // "the affirmative one" to pick, and guessing would answer a question the user did not.
    if (e.key === 'Escape' && selectState.cancellable) asyncPromptStore.answerSelect(null);
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
    handleSelectKeydown(e);
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!--
    The overlay divs below are click-to-cancel backdrops, not independent controls: their
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

<!-- Same backdrop pattern/reasoning as the confirm overlay above. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  style={!selectIsMounted ? 'display:none' : ''}
  onclick={handleSelectOverlayClick}
  class={[
    'prompt-overlay',
    'ignore_click_outside',
    !selectState.deferred && 'prompt-overlay-hidden',
  ]}
>
  <DecoratedCard
    class={[
      'floating-prompt',
      'ignore_click_outside',
      !selectState.deferred && 'floating-prompt-hidden',
    ]}
    isRelative={false}
    size="1.1rem"
  >
    <div style="white-space:pre-wrap">{selectState.question}</div>
    <div class="prompt-select-options">
      {#each selectState.options as option (option.value)}
        <button
          class="prompt-button prompt-select-option"
          disabled={option.disabled}
          style="background-color:{color};color:white"
          onclick={() => asyncPromptStore.answerSelect(option.value)}
        >
          <span>{option.text}</span>
          {#if option.description}
            <span class="prompt-select-description">{option.description}</span>
          {/if}
        </button>
      {/each}
    </div>
  </DecoratedCard>
</div>

<style>
  :global(.floating-prompt) {
    position: absolute;
    margin-right: auto;
    margin-left: auto;
    top: 1rem;
    display: flex;
    flex-direction: column;
    left: 0;
    right: 0;
    width: 45vw;
    max-width: 22rem;
    padding: 0.6rem;
    background-color: var(--primary);
    color: var(--primary-text);
    border: 2px solid var(--secondary);
    border-radius: 0.5rem;
    opacity: 1;
    z-index: 1000;
    word-break: break-word;
    transition: 0.3s all;
    opacity: 1;
    transform: translateY(0%);
    animation:
      prompt-show 0.3s,
      delayBackdrop 0.3s forwards;
  }

  @keyframes prompt-show {
    from {
      opacity: 0;
      transform: translateY(-20%);
    }

    to {
      opacity: 1;
      transform: translateY(0%);
    }
  }

  :global(.floating-prompt-hidden) {
    opacity: 0;
    transform: translateY(-20%);
    pointer-events: none;
  }

  .prompt-button {
    background-color: var(--primary);
    color: var(--primary-text);
    border: none;
    padding: 0.5rem 2rem;
    border-radius: 0.3rem;
    cursor: pointer;
  }

  .prompt-input {
    margin-top: 0.5rem;
    border-radius: 0.3rem;
    border: none;
    cursor: text;
    padding: 0.3rem;
  }

  .prompt-overlay {
    width: 100%;
    height: 100%;
    background-color: rgba(var(--primary-rgb), 0.7);
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1000;
    transition: all 0.2s;
    animation: overlay-show 0.2s linear;
  }

  @keyframes overlay-show {
    0% {
      opacity: 0.5;
    }

    to {
      opacity: 1;
    }
  }

  .prompt-overlay-hidden {
    opacity: 0;
  }

  .prompt-row {
    display: flex;
    width: 100%;
    margin-top: 0.5rem;
    justify-content: space-between;
  }

  .prompt-select-options {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.6rem;
  }

  /* Beats .prompt-button's own padding on specificity (Svelte's scoping class adds to it), which
     is what lets an option keep that button's look while laying its two lines out itself. */
  .prompt-select-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    padding: 0.5rem 0.7rem;
    text-align: left;
    width: 100%;
  }

  .prompt-select-option:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .prompt-select-description {
    font-size: 0.8rem;
    opacity: 0.8;
  }
</style>
