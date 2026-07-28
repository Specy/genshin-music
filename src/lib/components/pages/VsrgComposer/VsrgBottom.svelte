<script module lang="ts">
  // VsrgHitObjectType has no consumer outside the UI layer, so it stays declared here (rather
  // than in $core/types) and is exported for vsrg-composer/+page.svelte to import.
  export type VsrgHitObjectType = 'hold' | 'tap' | 'delete';
</script>

<script lang="ts">
  import type { SnapPoint } from '$core/types';
  import { VSRG_TEMPO_CHANGER } from '$core/legacyConfig';
  import type { VsrgSong } from '$core/Songs/VsrgSong';
  import { t } from '$i18n/binding.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import Select from '$cmp/inputs/Select.svelte';
  import MultipleOptionSlider, { type Option } from '$cmp/MultipleOptionSlider.svelte';

  let {
    selectedSnapPoint,
    isPlaying,
    vsrg,
    selectedHitObjectType,
    scaling,
    tempoChanger,
    onTempoChangerChange,
    togglePlay,
    onSnapPointChange,
    onHitObjectTypeChange,
    onScalingChange,
  }: {
    selectedSnapPoint: SnapPoint;
    isPlaying: boolean;
    vsrg: VsrgSong;
    selectedHitObjectType: VsrgHitObjectType;
    scaling: number;
    tempoChanger: number;
    onTempoChangerChange: (value: number) => void;
    togglePlay: () => void;
    onSnapPointChange: (snapPoint: SnapPoint) => void;
    onHitObjectTypeChange: (hitObjectType: VsrgHitObjectType) => void;
    onScalingChange: (scaling: number) => void;
  } = $props();

  const snapPoints: SnapPoint[] = [1, 2, 4, 8, 16];

  const options = $derived([
    {
      value: 'tap',
      text: t('vsrg_composer:tap'),
      color: 'var(--accent)',
    },
    {
      value: 'hold',
      text: t('vsrg_composer:hold'),
      color: '#8569a9',
    },
    {
      value: 'delete',
      text: t('vsrg_composer:delete'),
      color: 'var(--red)',
    },
  ] satisfies Option<VsrgHitObjectType>[]);
</script>

{#snippet faPlayIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="20"
    width="20"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M424.4 214.7L72.4 6.6C43.8-10.3 0 6.1 0 47.9V464c0 37.5 40.7 60.1 72.4 41.3l352-208c31.4-18.5 31.5-64.1 0-82.6z"
    /></svg
  >
{/snippet}

{#snippet faPauseIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="20"
    width="20"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M144 479H48c-26.5 0-48-21.5-48-48V79c0-26.5 21.5-48 48-48h96c26.5 0 48 21.5 48 48v352c0 26.5-21.5 48-48 48zm304-48V79c0-26.5-21.5-48-48-48h-96c-26.5 0-48 21.5-48 48v352c0 26.5 21.5 48 48 48h96c26.5 0 48-21.5 48-48z"
    /></svg
  >
{/snippet}

<div class="vsrg-bottom">
  <MultipleOptionSlider
    {options}
    selected={selectedHitObjectType}
    onChange={(value) => {
      onHitObjectTypeChange(value);
    }}
  />
  <div class="vsrg-name text-ellipsis">
    {vsrg.name}
  </div>
  <div class="flex-centered" style="flex:1;padding:0 1rem">
    <input
      type="range"
      min="10"
      style="width:100%"
      max="120"
      value={scaling}
      onpointerup={(e) => (e.target as HTMLElement | null)?.blur()}
      oninput={(e) => onScalingChange(parseInt(e.currentTarget.value))}
    />
  </div>
  <div class="flex-centered" style="height:100%">
    <Select
      value={tempoChanger}
      onchange={(e) => onTempoChangerChange(Number(e.currentTarget.value))}
      style="width:5rem;height:100%;border-radius:0.4rem;margin-right:0.6rem"
    >
      {#each VSRG_TEMPO_CHANGER as changer (changer)}
        <option value={changer}>
          {changer * 100}%
        </option>
      {/each}
    </Select>
    <Select
      value={selectedSnapPoint}
      onchange={(e) => {
        const parsed = parseInt(e.currentTarget.value) as SnapPoint;
        onSnapPointChange(parsed);
      }}
      style="width:6rem;height:100%;border-radius:0.4rem"
    >
      {#each snapPoints as snapPoint (snapPoint)}
        <option value={snapPoint}>{t('vsrg_composer:snap')}: 1/{snapPoint}</option>
      {/each}
    </Select>
    <AppButton class="vsrg-play-button flex-centered" onclick={togglePlay}>
      {#if isPlaying}
        {@render faPauseIcon()}
      {:else}
        {@render faPlayIcon()}
      {/if}
    </AppButton>
  </div>
</div>
