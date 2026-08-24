<script lang="ts">
  import SettingsRow from './SettingsRow.svelte';
  import { t } from '$i18n/binding.svelte';
  import type {
    SettingUpdate,
    SettingUpdateKey,
    SettingVolumeUpdate,
    SettingsCategory,
    SettingsPropriety,
  } from '$core/types/SettingsPropriety';

  let {
    settings,
    changeVolume,
    onUpdate,
    songLocked = false,
    hiddenSettings = [],
  }: {
    settings: Record<string, SettingsPropriety>;
    changeVolume?: (data: SettingVolumeUpdate) => void;
    onUpdate: (data: SettingUpdate) => void;
    /** Disable only settings serialized into the open song during a MIDI import session. */
    songLocked?: boolean;
    /** Settings rendered by a dedicated control elsewhere in the same panel. */
    hiddenSettings?: readonly SettingUpdateKey[];
  } = $props();

  type Group = {
    category: SettingsCategory;
    settings: Record<string, SettingsPropriety>;
  };

  // A plain object, not a Map: this is a scratch structure, fully consumed
  // within one $derived.by pass, never held as persistent state - avoids
  // eslint's svelte/prefer-svelte-reactivity nudge toward SvelteMap.
  // Object.values() below preserves first-seen insertion order only
  // because SettingsCategory's members are non-numeric string literals -
  // integer-like keys would sort numerically first and break this.
  const groups = $derived.by(() => {
    const byCategory: Partial<Record<SettingsCategory, Group>> = {};
    for (const [key, setting] of Object.entries(settings)) {
      if (hiddenSettings.includes(key as SettingUpdateKey)) continue;
      byCategory[setting.category] ??= { category: setting.category, settings: {} };
      byCategory[setting.category]!.settings[key] = setting;
    }
    return Object.values(byCategory);
  });
</script>

{#each groups as group (group.category)}
  <div class="column">
    <h1 class="settings-group-title">
      {t(`settings:category.${group.category}`)}
    </h1>
    {#each Object.entries(group.settings) as [key, setting] (key)}
      <fieldset class="settings-row-fieldset" disabled={songLocked && setting.songSetting}>
        <SettingsRow
          objKey={key as SettingUpdateKey}
          data={setting}
          {changeVolume}
          update={onUpdate}
        />
      </fieldset>
    {/each}
  </div>
{/each}

<style>
  .settings-group-title {
    font-size: 1.3rem;
    margin: 0.5rem 0;
  }

  .settings-row-fieldset {
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .settings-row-fieldset:disabled {
    opacity: 0.55;
  }
</style>
