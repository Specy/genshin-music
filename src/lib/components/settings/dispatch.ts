import type {Component} from 'svelte'
import SettingsSelect from './SettingsSelect.svelte'
import SettingsInput from './SettingsInput.svelte'
import SettingsSlider from './SettingsSlider.svelte'
import InstrumentInput from './InstrumentInput.svelte'
import Switch from '../inputs/Switch.svelte'
import type {SettingsPropriety} from '$core/types/SettingsPropriety'

// Old SettingsRow.tsx picked a component per `SettingsPropriety['type']` via an inline JSX
// conditional chain (`{type === "select" && <Select .../>}`, ...) with no single place naming the
// full type -> component mapping. Extracted here as an explicit, exported lookup table - a small,
// sanctioned refactor purely for testability: this test suite has no component-rendering harness
// (no @testing-library/svelte or similar), so `test/settingsDispatch.test.ts` can only verify the
// dispatch by importing component references and comparing identity/coverage, never by mounting
// SettingsRow and inspecting what it rendered. The `Record<SettingsPropriety['type'], ...>` type
// annotation itself is a compile-time completeness net (svelte-check errors if a union member's
// key is ever missing or misspelled); the test adds an independent runtime check on top.
//
// SettingsRow.svelte's own `{#if}`/`{:else if}` chain (same branch conditions as old, preserved
// per this task's brief) imports these same five components directly rather than reading through
// this map, so each branch keeps its own precise, per-component prop types (and the same explicit
// `as boolean`/`as string | number`/`as number` casts old needed on its shared `currentValue`
// state - see that file's own comment). That means this map and SettingsRow's template are two
// independent references to the same five files, not one indirected through the other: if a type
// is ever re-routed to a different component in ONE of the two places without updating the other,
// this test won't catch that specific drift (it only knows about this map, not about
// SettingsRow's template) - a disclosed, low-blast-radius tradeoff, since the far more likely
// mistake (a NEW settings type added to `SettingsPropriety['type']` without wiring a component
// anywhere) IS caught, by both the type annotation below and the test's exhaustiveness check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const settingsComponentByType: Record<SettingsPropriety['type'], Component<any>> = {
    select: SettingsSelect,
    number: SettingsInput,
    text: SettingsInput,
    checkbox: Switch,
    slider: SettingsSlider,
    instrument: InstrumentInput,
}
