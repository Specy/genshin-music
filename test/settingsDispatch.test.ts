import {describe, expect, it} from 'vitest'
import {settingsComponentByType} from '../src/lib/components/settings/dispatch'
import SettingsSelect from '../src/lib/components/settings/SettingsSelect.svelte'
import SettingsInput from '../src/lib/components/settings/SettingsInput.svelte'
import SettingsSlider from '../src/lib/components/settings/SettingsSlider.svelte'
import InstrumentInput from '../src/lib/components/settings/InstrumentInput.svelte'
import Switch from '../src/lib/components/inputs/Switch.svelte'

// SettingsRow.svelte's own template preserves old SettingsRow.tsx's type-dispatch conditional
// chain (select/number|text/checkbox/slider/instrument) with real per-branch component imports and
// prop types - it isn't driven by `settingsComponentByType` (see dispatch.ts's own comment on why).
// This suite is therefore a "component-free" check in the sense the task brief asks for: it never
// mounts SettingsRow (this repo's test suite has no component-rendering harness), only imports
// component references and compares them against the exported lookup table.
//
// This is deliberately a RUNTIME list, not a type-level exhaustiveness trick against
// `SettingsPropriety['type']`: `tsconfig.json` excludes `test/` (see its own NOTE comment), so
// `npm run check`/`check:sky` never type-check this file, and `vitest run` strips types without
// checking them - a `type X = ... extends never ? true : [...]` assertion living here would
// silently never run under any of this project's actual gates. The REAL compile-time completeness
// net is `dispatch.ts`'s own `Record<SettingsPropriety['type'], Component<any>>` annotation on
// `settingsComponentByType` itself (that file lives under `src/lib`, which `check`/`check:sky` DO
// cover - a missing or misspelled union member there is a genuine svelte-check error). This test
// adds an independent RUNTIME check on top of that static one, per the task brief's own "enumerate
// via a literal list asserted against the map's keys" instruction.
const ALL_SETTINGS_TYPES = ['instrument', 'select', 'slider', 'number', 'checkbox', 'text'] as const

describe('settingsComponentByType (SettingsRow dispatch table)', () => {
    it('covers every SettingsPropriety union member, no more and no fewer', () => {
        expect(Object.keys(settingsComponentByType).sort()).toEqual([...ALL_SETTINGS_TYPES].sort())
    })

    it('maps each type to the same component SettingsRow.svelte renders for it', () => {
        expect(settingsComponentByType.select).toBe(SettingsSelect)
        expect(settingsComponentByType.number).toBe(SettingsInput)
        expect(settingsComponentByType.text).toBe(SettingsInput)
        expect(settingsComponentByType.checkbox).toBe(Switch)
        expect(settingsComponentByType.slider).toBe(SettingsSlider)
        expect(settingsComponentByType.instrument).toBe(InstrumentInput)
    })

    it("'number' and 'text' intentionally share one component (SettingsInput handles both, old Input.tsx precedent)", () => {
        expect(settingsComponentByType.number).toBe(settingsComponentByType.text)
    })

    it('every dispatch entry is a truthy component reference', () => {
        for (const type of ALL_SETTINGS_TYPES) {
            expect(settingsComponentByType[type]).toBeTruthy()
        }
    })
})
