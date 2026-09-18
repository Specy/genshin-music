<script lang="ts">
  import type { ComposerSettingsDataType } from '$core/BaseSettings';
  import type { SettingUpdate } from '$core/types/SettingsPropriety';
  import { t } from '$i18n/binding.svelte';
  import MultipleOptionSlider, { type Option } from '$cmp/MultipleOptionSlider.svelte';

  type ComposerView = 'normal' | 'pro';

  let {
    setting,
    onUpdate,
  }: {
    setting: ComposerSettingsDataType['proView'];
    onUpdate: (data: SettingUpdate) => void;
  } = $props();

  const selected = $derived<ComposerView>(setting.value ? 'pro' : 'normal');
  const options = $derived([
    {
      value: 'normal',
      text: t('composer:normal_view'),
      color: 'var(--accent)',
    },
    {
      value: 'pro',
      text: t('composer:pro_view'),
      color: 'var(--accent)',
    },
  ] satisfies Option<ComposerView>[]);

  function selectView(view: ComposerView) {
    onUpdate({
      key: 'proView',
      data: { ...setting, value: view === 'pro' },
    });
  }
</script>

<div class="composer-view-selector">
  <MultipleOptionSlider {options} {selected} onChange={selectView} />
</div>

<style>
  .composer-view-selector {
    display: flex;
    justify-content: center;
    align-items: stretch;
    gap: 0.4rem;
    height: 2.5rem;
    min-height: 2.5rem;
  }
</style>
