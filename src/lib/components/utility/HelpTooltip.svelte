<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    maxWidth = 18,
    buttonStyle = '',
    parentStyle = '',
    width,
    position = 'right',
  }: {
    children: Snippet;
    maxWidth?: number;
    width?: number;
    position?: 'left' | 'right' | 'middle';
    buttonStyle?: string;
    parentStyle?: string;
  } = $props();

  const positionMap = { left: '-100%', right: '0', middle: '-50%' };
</script>

<div class="help-tooltip" style="position:relative;{parentStyle}">
  <button
    class="help-tooltip-button"
    style={buttonStyle}
    aria-label="Help"
    onclick={(e) => e.currentTarget.focus()}
  >
    <svg
      stroke="currentColor"
      fill="currentColor"
      stroke-width="0"
      viewBox="0 0 24 24"
      style="width:100%;height:100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path fill="none" d="M0 0h24v24H0z" />
      <path
        d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"
      />
    </svg>
  </button>
  <div
    class="help-tooltip-content"
    style="translate:{positionMap[position]};max-width:{maxWidth}rem;width:{width !== undefined
      ? `${width}rem`
      : 'max-content'}"
  >
    {@render children()}
  </div>
</div>

<style>
  .help-tooltip :global(ul) {
    margin: 0.2rem;
    padding-left: 0.6rem;
  }

  .help-tooltip :global(li) {
    margin-bottom: 0.2rem;
  }

  .help-tooltip-button {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--primary);
    color: var(--primary-text);
    padding: 0;
    width: 1.8rem;
    height: 1.8rem;
    cursor: pointer;
    border-radius: 50%;
    border: 0;
    transition: all 0.2s;
  }

  /* Pointer-only (see App.css's `.app-button:hover` for the full reason): a tapped element keeps
     matching `:hover` until the next tap lands elsewhere, and this button survives its own tap by
     design, so on touch the `?` would simply stay lying at 30 degrees. The `:focus` rules below are
     NOT guarded and must not be: on a phone they are the only way this tooltip opens. */
  @media (hover: hover) {
    .help-tooltip-button:hover {
      transform: rotate(30deg);
      filter: brightness(1.1);
    }
  }

  .help-tooltip-content {
    position: absolute;
    transform: translateY(0.4rem);
    --existing-transform: translateY(0.4rem);
    display: none;
    box-shadow:
      0 10px 15px -3px rgb(0 0 0 / 0.15),
      0 4px 6px -4px rgb(0 0 0 / 0.15);
    border: solid 2px var(--secondary);
    padding: 0.3rem 0.6rem;
    border-radius: 0.4rem;
    font-size: 0.8rem;
    /* Above the controls a card raises to sit over their own decorations - MultipleOptionSlider's
       buttons are grid items at z-index 2 so its moving pill stays behind their labels, and a
       tooltip that only TIES with them loses on DOM order and opens underneath. Deliberately small:
       it still has to lose to the app's own layers, which start at the side menu's 15. */
    z-index: 4;
    pointer-events: none;
  }

  .help-tooltip-button:focus + .help-tooltip-content {
    display: flex;
    background-color: var(--primary);
    color: var(--primary-text);
    animation: fadeIn 0.3s;
    animation-fill-mode: forwards;
  }

  .help-tooltip-button:focus {
    background-color: var(--accent);
    color: var(--accent-text);
  }
</style>
