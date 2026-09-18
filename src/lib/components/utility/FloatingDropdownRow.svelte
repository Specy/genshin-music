<script lang="ts">
  import type { Snippet } from 'svelte';
  import AppButton from '../inputs/AppButton.svelte';

  let {
    children,
    onclick,
    style = '',
    disabled = false,
  }: {
    children: Snippet;
    onclick?: () => void;
    style?: string;
    disabled?: boolean;
  } = $props();
</script>

<AppButton
  ariaLabel="Floating Dropdown Button"
  class="row row-centered"
  style="padding:0.4rem;min-width:unset;{style}"
  {onclick}
  {disabled}
>
  {@render children()}
</AppButton>
