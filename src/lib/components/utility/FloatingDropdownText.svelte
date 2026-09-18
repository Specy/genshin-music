<script lang="ts">
  let { text }: { text: string } = $props();
</script>

<div class="floating-dropdown-text">
  {text}
</div>

<style>
  .floating-dropdown-text {
    display: flex;
    font-size: 0.8rem;
    white-space: nowrap;
  }
</style>
