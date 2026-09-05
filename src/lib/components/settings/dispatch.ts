import type { Component } from 'svelte';
import SettingsSelect from './SettingsSelect.svelte';
import SettingsInput from './SettingsInput.svelte';
import SettingsSlider from './SettingsSlider.svelte';
import InstrumentInput from './InstrumentInput.svelte';
import Switch from '../inputs/Switch.svelte';
import type { SettingsPropriety } from '$core/types/SettingsPropriety';

// A component-per-type lookup table, kept for testability: this test suite
// has no component-rendering harness, so test/settingsDispatch.test.ts can
// only verify coverage by comparing component references, not by mounting
// SettingsRow and inspecting what it rendered. The `Record<...>` annotation
// below is also a compile-time completeness net (svelte-check errors if a
// union member's key is missing or misspelled).
//
// SettingsRow.svelte's own {#if} chain imports these same five components
// directly rather than reading through this map - so this map and that
// template are two INDEPENDENT references to the same five files. If a type
// is ever re-routed to a different component in only ONE of the two places,
// this test will NOT catch that drift; it only catches a new settings type
// added without any component wired here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const settingsComponentByType: Record<SettingsPropriety['type'], Component<any>> = {
  select: SettingsSelect,
  number: SettingsInput,
  text: SettingsInput,
  checkbox: Switch,
  slider: SettingsSlider,
  instrument: InstrumentInput,
};
