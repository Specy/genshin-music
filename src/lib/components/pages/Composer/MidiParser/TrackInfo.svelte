<script lang="ts">
    import {untrack} from 'svelte'
    import type {CustomTrack} from './MidiParser.svelte'
    import type {InstrumentData} from '$core/Songs/SongClasses'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {prettyPrintInstrumentName} from '$core/utils/Utilities'
    import {t} from '$i18n/binding.svelte'
    import Row from '$cmp/layout/Row.svelte'
    import Column from '$cmp/layout/Column.svelte'
    import Select from '$cmp/inputs/Select.svelte'
    import Tooltip from '$cmp/utility/Tooltip.svelte'
    import {hasTooltip} from '$cmp/utility/tooltip'
    import NumericalInput from './NumericalInput.svelte'

    // Old: src/components/pages/Composer/MidiParser/TrackInfo.tsx (154 lines, exported function
    // component `TrackInfo`). One row per MIDI track: a checkbox + note-count/instrument-family
    // summary + layer picker + a settings-gear toggle that expands a details panel (local note
    // offset, max octave scaling, instrument name, note/accidental/out-of-range counts).
    //
    // `theme: Theme` (old, threaded in as a prop from `MidiParser`'s own mobx-observed snapshot) ->
    // `ThemeProvider` imported directly, same established precedent as every other Phase-4
    // component (e.g. `ComposerSongRow.svelte`).
    //
    // `useDebounce<string>(offset, 600)`'s own internal `useState`+`useEffect` pair -> a `$state` +
    // a `$effect` owning its own setTimeout/clearTimeout cleanup, the same established precedent as
    // `BodyDropper.svelte`'s identical `useDebounce(_isHovering, 50)` port (and this task's own
    // sibling `NumericalInput.svelte`, which needs the same shape for its own debounced value).
    //
    // `useCallback` for `onMaxScaleChange` dropped (Svelte 5 fine-grained reactivity, no
    // memoization ceremony needed - established precedent throughout this migration).
    let {
        data,
        index,
        onChange,
        instruments,
    }: {
        data: CustomTrack
        index: number
        instruments: InstrumentData[]
        onChange: (index: number, data: Partial<CustomTrack>) => void
    } = $props()

    let dataShown = $state(false)
    const background = $derived(`background-color:${ThemeProvider.layer('menu_background', 0.15).toString()}`)

    // Old: `const [offset, setOffset] = useState(`${data.localOffset ?? ""}`)` +
    // `useEffect(() => setOffset(`${data.localOffset ?? ""}`), [data.localOffset])`. A *writable*
    // `$derived` (Svelte >=5.25) replaces both the `$state` and its resync effect in one: reading
    // `offset` tracks `data.localOffset` normally, the +/- buttons and the text input below can
    // still assign `offset = ...` directly to diverge from it locally, and that override is itself
    // overwritten the next time `data.localOffset` actually changes - the exact same "diverge
    // locally, resync on prop change" behavior old's separate state+effect pair gave. Same
    // established precedent as `SettingsRow.svelte`'s `currentValue` (and this task's own sibling
    // `NumericalInput.svelte`'s `elementValue`).
    let offset = $derived(`${data.localOffset ?? ''}`)
    // Old: `useDebounce`'s own internal `useState(offset)` seed - a ONE-TIME read with no resync of
    // its own (only the debounce-timer effect below ever updates it, off of the local `offset`,
    // never directly off `data.localOffset`) - same established precedent as `SettingsRow.svelte`'s
    // `volume` (a plain one-time-read `$state`, not a `$derived`).
    // svelte-ignore state_referenced_locally
    let debouncedOffset = $state(`${data.localOffset ?? ''}`)

    // Old: `useEffect(() => { const handler = setTimeout(() => setDebouncedValue(offset), 600);
    // return () => clearTimeout(handler) }, [offset, 600])` (useDebounce's own internal effect).
    $effect(() => {
        void offset
        const handle = setTimeout(() => {
            debouncedOffset = offset
        }, 600)
        return () => clearTimeout(handle)
    })

    // Old: `useEffect(() => { const parsedOffset = parseInt(debouncedOffset); const localOffset =
    // Number.isFinite(parsedOffset) ? parsedOffset : null; setOffset(`${localOffset ?? ""}`);
    // onChange(index, {localOffset}) }, [debouncedOffset, onChange, index])`. `onChange` (=
    // `MidiParser.svelte`'s `editTrack`) is called through `untrack()`: it funnels into
    // `convertMidi()`, which reads-then-writes several `$state` fields (e.g. `track
    // .numberOfAccidentals++`) - left untracked, THIS effect would auto-track those as its own
    // dependencies and immediately re-invalidate itself the moment a MIDI file is loaded, throwing
    // `effect_update_depth_exceeded`. Same established fix as `ZenKeyboardStore.svelte.ts`'s
    // `setKeyboardLayout` effect, `ZenNote.svelte`'s `statusId` write, `Player.svelte`'s
    // settings-sync effect, and this task's own sibling `NumericalInput.svelte` (same hazard, same
    // fix) - a required, correctness-preserving adaptation for Svelte's auto-tracking (old's
    // `useEffect`, keyed on an explicit dependency array, never had this hazard to begin with).
    $effect(() => {
        const parsedOffset = parseInt(debouncedOffset)
        const localOffset = Number.isFinite(parsedOffset) ? parsedOffset : null
        offset = `${localOffset ?? ''}`
        untrack(() => onChange(index, {localOffset}))
    })

    function onMaxScaleChange(maxScaling: number) {
        onChange(index, {maxScaling: Math.max(0, maxScaling)})
    }
</script>

<Column gap="0.5rem" className="midi-track-column" style={background}>
    <div class="midi-track-wrapper">
        <div class="midi-track-center">
            <input type="checkbox" onchange={() => onChange(index, {selected: !data.selected})} checked={data.selected} />
            <!-- Old spread this text across a template-literal expression + 3 separate JSXText
                 fragments ("(" / "," / ")"), each on its own line - JSX's own whitespace-collapsing
                 rules (newline-adjacent whitespace is stripped, not converted to a space) reduce
                 that to the exact same concatenated string a single template literal produces here;
                 flattened for unambiguous Svelte whitespace handling, byte-identical rendered text. -->
            {`${data.name} (${data.track.notes.length}, ${data.track.instrument.family})`}
        </div>
        <div class="midi-track-center">
            <Select
                onchange={(e) => onChange(index, {layer: Number(e.currentTarget.value)})}
                value={data.layer}
                style="margin-left:0.2rem;padding-right:1.5rem"
            >
                {#each instruments as ins, i (i)}
                    <option value={i}>{ins.alias || prettyPrintInstrumentName(ins.name)} - Layer {i + 1}</option>
                {/each}
            </Select>
            <!-- react-icons/fa's FaCog (unpkg.com/react-icons@5.6.0/fa/index.mjs), same path data
                 already byte-verified in this migration (InstrumentControls.svelte/ComposerMenu.svelte).
                 Old passed size={22} + color={dataShown ? 'var(--secondary)' : 'var(--primary)'} +
                 cursor='pointer' directly on the icon itself (no wrapping button) - `color` merges
                 into the rendered `style` (react-icons' IconBase), `cursor` is a plain rest prop
                 spread straight onto the <svg> as its own attribute (verified against the real
                 iconBase.mjs source), and `onClick` goes directly on the <svg> too - reproduced with
                 the same svelte-ignore pair `ComposerMenu.svelte`'s hamburger div already
                 established for a bare clickable non-button element. -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <svg
                stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512"
                height="22" width="22" xmlns="http://www.w3.org/2000/svg"
                style="color:{dataShown ? 'var(--secondary)' : 'var(--primary)'}"
                cursor="pointer"
                onclick={() => dataShown = !dataShown}
            ><path d="M487.4 315.7l-42.6-24.6c4.3-23.2 4.3-47 0-70.2l42.6-24.6c4.9-2.8 7.1-8.6 5.5-14-11.1-35.6-30-67.8-54.7-94.6-3.8-4.1-10-5.1-14.8-2.3L380.8 110c-17.9-15.4-38.5-27.3-60.8-35.1V25.8c0-5.6-3.9-10.5-9.4-11.7-36.7-8.2-74.3-7.8-109.2 0-5.5 1.2-9.4 6.1-9.4 11.7V75c-22.2 7.9-42.8 19.8-60.8 35.1L88.7 85.5c-4.9-2.8-11-1.9-14.8 2.3-24.7 26.7-43.6 58.9-54.7 94.6-1.7 5.4.6 11.2 5.5 14L67.3 221c-4.3 23.2-4.3 47 0 70.2l-42.6 24.6c-4.9 2.8-7.1 8.6-5.5 14 11.1 35.6 30 67.8 54.7 94.6 3.8 4.1 10 5.1 14.8 2.3l42.6-24.6c17.9 15.4 38.5 27.3 60.8 35.1v49.2c0 5.6 3.9 10.5 9.4 11.7 36.7 8.2 74.3 7.8 109.2 0 5.5-1.2 9.4-6.1 9.4-11.7v-49.2c22.2-7.9 42.8-19.8 60.8-35.1l42.6 24.6c4.9 2.8 11 1.9 14.8-2.3 24.7-26.7 43.6-58.9 54.7-94.6 1.5-5.5-.7-11.3-5.6-14.1zM256 336c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z"/></svg>
        </div>
    </div>
    <Column
        padding="0.4rem"
        gap="0.2rem"
        style="display:{dataShown ? 'flex' : 'none'};border-top:solid 0.1rem var(--secondary)"
    >
        <Row align="center" justify="between">
            <div class={hasTooltip(true)}>
                <Tooltip>
                    {t('composer:midi_parser.local_note_offset_description')}
                </Tooltip>
                {t('composer:midi_parser.local_note_offset')}
            </div>
            <Row gap="0.3rem">
                <button onclick={() => offset = `${Number(offset) - 1}`} class="midi-btn-small">-</button>
                <input
                    type="text"
                    value={offset}
                    placeholder="No offset"
                    class="midi-input"
                    style="width:4rem"
                    oninput={(e) => offset = e.currentTarget.value}
                />
                <button onclick={() => offset = `${Number(offset) + 1}`} class="midi-btn-small">+</button>
            </Row>
        </Row>
        <Row align="center" justify="between">
            <div class={hasTooltip(true)}>
                <Tooltip>
                    {t('composer:midi_parser.max_octave_scaling_description')}
                </Tooltip>
                {t('composer:midi_parser.max_octave_scaling')}
            </div>
            <NumericalInput value={data.maxScaling} placeholder="No scaling" onChange={onMaxScaleChange} />
        </Row>
        <Row align="center" justify="between">
            <div>{t('common:instrument')}</div>
            <div>{data.track.instrument.name}</div>
        </Row>
        <Row align="center" justify="between">
            <div>{t('composer:midi_parser.number_of_notes')}</div>
            <div>{data.track.notes.length}</div>
        </Row>
        <Row align="center" justify="between">
            <div>{t('composer:midi_parser.accidentals')}</div>
            <div>{data.numberOfAccidentals}</div>
        </Row>
        <Row align="center" justify="between">
            <div>{t('composer:midi_parser.out_of_range')}({data.outOfRangeBounds.upper + data.outOfRangeBounds.lower})</div>
            <Row style="width:fit-content">
                <Row style="margin-right:0.4rem">
                    <!-- react-icons/fa's FaArrowUp, viewBox/path fetched live from react-icons@5.6.0
                         (unpkg.com/react-icons@5.6.0/fa/index.mjs) for this task. Old passed only
                         `style={{marginRight: '0.2rem'}}` - default 1em size, currentColor fill. -->
                    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style="margin-right:0.2rem"><path d="M34.9 289.5l-22.2-22.2c-9.4-9.4-9.4-24.6 0-33.9L207 39c9.4-9.4 24.6-9.4 33.9 0l194.3 194.3c9.4 9.4 9.4 24.6 0 33.9L413 289.4c-9.5 9.5-25 9.3-34.3-.4L264 168.6V456c0 13.3-10.7 24-24 24h-32c-13.3 0-24-10.7-24-24V168.6L69.2 289.1c-9.3 9.8-24.8 10-34.3.4z"/></svg>
                    {data.outOfRangeBounds.upper}
                </Row>
                <Row>
                    <!-- react-icons/fa's FaArrowDown, same sourcing. -->
                    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style="margin-right:0.2rem"><path d="M413.1 222.5l22.2 22.2c9.4 9.4 9.4 24.6 0 33.9L241 473c-9.4 9.4-24.6 9.4-33.9 0L12.7 278.6c-9.4-9.4-9.4-24.6 0-33.9l22.2-22.2c9.5-9.5 25-9.3 34.3.4L184 343.4V56c0-13.3 10.7-24 24-24h32c13.3 0 24 10.7 24 24v287.4l114.8-120.5c9.3-9.8 24.8-10 34.3-.4z"/></svg>
                    {data.outOfRangeBounds.lower}
                </Row>
            </Row>
        </Row>
    </Column>
</Column>
