<script lang="ts">
  import { logger, LoggerStatus } from '$stores/LoggerStore.svelte';
  import DecoratedCard from '../layout/DecoratedCard.svelte';

  // The Toast sub-component is inlined into the {#each} below rather than
  // split into a second file - it only ever had one call site.
</script>

<div class="logger-wrapper">
  {#each logger.toasts as toast (toast.id)}
    {@const isBig = toast.text.length > 150}
    <DecoratedCard
      class={toast.visible ? 'logger-toast' : 'logger-toast logger-toast-hidden'}
      style="max-width:{isBig ? '24rem' : '19rem'}"
      onclick={() => logger.removeToast(toast.id)}
    >
      <div class="logger-content">
        {#if !isBig}
          <div class="logger-status">
            {#if toast.type === LoggerStatus.ERROR}
              <svg
                stroke="currentColor"
                fill="currentColor"
                stroke-width="0"
                viewBox="0 0 512 512"
                color={toast.type}
                style="color:{toast.type}"
                height="20"
                width="20"
                xmlns="http://www.w3.org/2000/svg"
                ><path
                  d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm121.6 313.1c4.7 4.7 4.7 12.3 0 17L338 377.6c-4.7 4.7-12.3 4.7-17 0L256 312l-65.1 65.6c-4.7 4.7-12.3 4.7-17 0L134.4 338c-4.7-4.7-4.7-12.3 0-17l65.6-65-65.6-65.1c-4.7-4.7-4.7-12.3 0-17l39.6-39.6c4.7-4.7 12.3-4.7 17 0l65 65.7 65.1-65.6c4.7-4.7 12.3-4.7 17 0l39.6 39.6c4.7 4.7 4.7 12.3 0 17L312 256l65.6 65.1z"
                /></svg
              >
            {/if}
            {#if toast.type === LoggerStatus.SUCCESS}
              <svg
                stroke="currentColor"
                fill="currentColor"
                stroke-width="0"
                viewBox="0 0 512 512"
                color={toast.type}
                style="color:{toast.type}"
                height="20"
                width="20"
                xmlns="http://www.w3.org/2000/svg"
                ><path
                  d="M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628.001z"
                /></svg
              >
            {/if}
            {#if toast.type === LoggerStatus.WARN}
              <svg
                stroke="currentColor"
                fill="currentColor"
                stroke-width="0"
                viewBox="0 0 576 512"
                color={toast.type}
                style="color:{toast.type}"
                height="20"
                width="20"
                xmlns="http://www.w3.org/2000/svg"
                ><path
                  d="M569.517 440.013C587.975 472.007 564.806 512 527.94 512H48.054c-36.937 0-59.999-40.055-41.577-71.987L246.423 23.985c18.467-32.009 64.72-31.951 83.154 0l239.94 416.028zM288 354c-25.405 0-46 20.595-46 46s20.595 46 46 46 46-20.595 46-46-20.595-46-46-46zm-43.673-165.346l7.418 136c.347 6.364 5.609 11.346 11.982 11.346h48.546c6.373 0 11.635-4.982 11.982-11.346l7.418-136c.375-6.874-5.098-12.654-11.982-12.654h-63.383c-6.884 0-12.356 5.78-11.981 12.654z"
                /></svg
              >
            {/if}
          </div>
        {/if}
        <div class="logger-text">{toast.text}</div>
      </div>
      <div class="logger-progress-outer">
        <div
          class="logger-progress-bar"
          style="animation:logger-animation {toast.timeout}ms linear forwards;background-color:{toast.type}"
        ></div>
      </div>
    </DecoratedCard>
  {/each}
</div>
<div
  class={[
    'flex-centered',
    'pill',
    logger.pillState.visible && 'pill-visible',
    logger.pillState.spinner && 'pill-with-spinner',
    logger.pillState.actions.length > 0 && 'pill-with-actions',
  ]}
>
  {#if logger.pillState.spinner}
    <!-- Decorative only - the pill's text already says what is loading, so a screen reader
         announcing the spinner as well would just repeat it. -->
    <div class="pill-spinner" aria-hidden="true"></div>
  {/if}
  <span>{logger.pillState.text}</span>
  {#each logger.pillState.actions as action (action)}
    <button class="pill-button" type="button" onclick={action.onClick}>{action.text}</button>
  {/each}
</div>

<style>
  .logger-wrapper {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.4rem;
    position: fixed;
    max-height: 100vh;
    overflow-y: scroll;
    right: 0;
    top: 0rem;
    padding: 0.8rem 0;
    z-index: 999;
  }

  :global(.logger-toast) {
    border-radius: 0.4rem;
    border: solid 2px var(--secondary);
    min-width: 15rem;
    background-color: var(--primary);
    box-shadow:
      0 10px 15px -3px rgb(0 0 0 / 0.1),
      0 4px 6px -4px rgb(0 0 0 / 0.1);
    color: var(--primary-text);
    display: flex;
    padding: 0.5rem;
    transition: all 0.3s;
    display: flex;
    flex-direction: column;
    opacity: 1;
    margin: 0 0.8rem;
    transform: scale(1) translateY(0);
    animation: toastAppear 0.3s;
  }

  @keyframes toastAppear {
    0% {
      opacity: 0.3;
      transform: scale(0.8) translateY(calc(-120% - 0.8rem));
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  :global(.logger-toast-hidden) {
    opacity: 0;
    pointer-events: none;
    transform: scale(0.8) translateY(calc(-120% - 0.8rem));
  }

  .pill {
    position: fixed;
    border-radius: 1.5rem;
    padding: 0.5rem 1.5rem;
    gap: 0.6rem;
    transition: all 0.3s;
    min-height: 2.4rem;
    background-color: rgba(var(--secondary-rgb), 0.9);
    top: 0.8rem;
    font-size: 0.8rem;
    right: 50vw;
    z-index: 998; /* Below logger */
    pointer-events: none;
    box-shadow:
      0 10px 15px -3px rgb(0 0 0 / 0.1),
      0 4px 6px -4px rgb(0 0 0 / 0.1);
    color: var(--secondary-text);
    opacity: 0;
    transform: translateX(50%) translateY(calc(-120% - 0.8rem));
  }

  .pill-with-spinner {
    padding-left: 0.8rem;
  }

  .pill-with-actions {
    padding-right: 0.6rem;
  }

  .pill-visible {
    opacity: 1;
    transform: translateY(0) translateX(50%);
    animation: delayBackdrop calc(0.2s * 1.2) forwards;
  }

  /* Sized in em so the spinner tracks the pill's font-size, and drawn in currentColor so it
     inherits whatever text color the active theme resolved for the pill's background. */
  .pill-spinner {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-top-color: transparent;
    animation: pill-spin 0.7s linear infinite;
  }

  @keyframes pill-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .pill-button {
    /* The pill itself is pointer-events:none so it never blocks clicks on the app underneath;
       re-enabling it here keeps that true for everything except the buttons. */
    pointer-events: auto;
    flex-shrink: 0;
    background-color: var(--primary);
    color: var(--primary-text);
    border: none;
    border-radius: 1rem;
    padding: 0.2rem 0.7rem;
    font-size: inherit;
    font-family: inherit;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .pill-button:hover {
    background-color: var(--primary-layer-10);
  }

  /* hidePill only flips visibility, so a dismissed pill keeps its contents through the fade-out;
     its children then have to be neutralized once that fade ends, or the spinner would animate
     forever offscreen and the action buttons would stay focusable and keyboard-clickable while
     invisible. The 0s/0.3s delay matches the pill's own fade, so nothing pops out mid-transition. */
  .pill:not(.pill-visible) .pill-spinner,
  .pill:not(.pill-visible) .pill-button {
    visibility: hidden;
    animation-play-state: paused;
    transition: visibility 0s 0.3s;
  }

  .logger-content {
    display: flex;
    flex-direction: row;
    flex: 1;
    padding: 0.1rem;
    font-size: 0.9rem;
  }

  .logger-progress-outer {
    overflow: hidden;
    height: 5px;
    margin-top: 0.6rem;
    border-radius: 0.5rem;
  }

  .logger-progress-bar {
    height: 100%;
    width: 100%;
    background-color: var(--accent);
    animation: logger-animation linear 1s forwards;
  }

  @keyframes logger-animation {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(-100%);
    }
  }

  .logger-status {
    display: flex;
    align-items: center;
    margin-right: 0.6rem;
    max-height: 1.4rem;
  }

  .logger-text {
    flex: 1;
    display: flex;
    align-items: center;
    white-space: pre-line;
    font-size: 0.9rem;
  }
</style>
