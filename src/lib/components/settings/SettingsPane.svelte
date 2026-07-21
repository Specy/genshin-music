<script lang="ts">
    import SettingsRow from './SettingsRow.svelte'
    import {t} from '$i18n/binding.svelte'
    import type {SettingUpdate, SettingUpdateKey, SettingVolumeUpdate, SettingsCategory, SettingsPropriety} from '$core/types/SettingsPropriety'

    // Old: src/components/shared/Settings/SettingsPane.tsx
    let {
        settings,
        changeVolume,
        onUpdate,
    }: {
        settings: Record<string, SettingsPropriety>
        changeVolume?: (data: SettingVolumeUpdate) => void
        onUpdate: (data: SettingUpdate) => void
    } = $props()

    type Group = {
        category: SettingsCategory
        settings: Record<string, SettingsPropriety>
    }

    // Old grouped `Object.entries(settings)` into a `Map<String, Group>` (old's own `String` -
    // the boxed wrapper type, not the `string` primitive - is a harmless pre-existing type-only
    // quirk with zero runtime effect either way, not reproduced below). Rewritten here as a plain
    // keyed object instead of a `Map`: this is a scratch structure built fresh and fully consumed
    // within a single `$derived.by` pass (never held as persistent state), and `SettingsCategory`'s
    // members are all ordinary (non-index-like) string literals, so `Object.values()` preserves
    // first-seen insertion order exactly like old's `Map` did - same grouping/order semantics,
    // without eslint's `svelte/prefer-svelte-reactivity` nudge toward `SvelteMap` (a wrapper meant
    // for Maps that themselves need to BE reactive state, not a same-pass-only local). `$derived.by`
    // re-runs this grouping whenever `settings` changes, matching old's per-render rebuild (old
    // re-grouped on every render regardless of whether `settings` had actually changed;
    // `$derived.by` only recomputes when its tracked dependencies change - strictly fewer
    // recomputations, not an observably different result).
    const groups = $derived.by(() => {
        const byCategory: Partial<Record<SettingsCategory, Group>> = {}
        for (const [key, setting] of Object.entries(settings)) {
            byCategory[setting.category] ??= {category: setting.category, settings: {}}
            byCategory[setting.category]!.settings[key] = setting
        }
        return Object.values(byCategory)
    })
</script>

{#each groups as group (group.category)}
    <div class="column">
        <h1 class="settings-group-title">
            {t(`settings:category.${group.category}`)}
        </h1>
        {#each Object.entries(group.settings) as [key, setting] (key)}
            <SettingsRow
                objKey={key as SettingUpdateKey}
                data={setting}
                changeVolume={changeVolume}
                update={onUpdate}
            />
        {/each}
    </div>
{/each}

<style>
    .settings-group-title {
        font-size: 1.3rem;
        margin: 0.5rem 0;
    }
</style>
