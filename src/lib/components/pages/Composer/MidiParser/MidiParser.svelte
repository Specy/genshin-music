<script module lang="ts">
    import type {Track} from '@tonejs/midi'

    export type CustomTrack = {
        track: Track
        selected: boolean
        layer: number
        name: string
        numberOfAccidentals: number
        localOffset: number | null
        maxScaling: number
        outOfRangeBounds: {
            lower: number
            upper: number
        }
    }
</script>

<script lang="ts">
    import {base} from '$app/paths'
    import {game} from '$game'
    import type {Pitch} from '$lib/games/types'
    import {basicPitchLoader} from '$lib/audio/BasicPitchLoader'
    import {logger} from '$stores/LoggerStore.svelte'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {ComposedSong} from '$core/Songs/ComposedSong'
    import {ColumnNote, MidiNote, NoteColumn, type InstrumentData} from '$core/Songs/SongClasses'
    import {NoteLayer} from '$core/Songs/Layer'
    import {delay, groupNotesByIndex, isAudioFormat, isVideoFormat, mergeLayers} from '$core/utils/Utilities'
    import {t} from '$i18n/binding.svelte'
    import FilePicker, {type FileElement} from '$cmp/inputs/FilePicker.svelte'
    import Switch from '$cmp/inputs/Switch.svelte'
    import PitchSelect from '$cmp/inputs/PitchSelect.svelte'
    import HelpTooltip from '$cmp/utility/HelpTooltip.svelte'
    import DecoratedCard from '$cmp/layout/DecoratedCard.svelte'
    import Row from '$cmp/layout/Row.svelte'
    import Column from '$cmp/layout/Column.svelte'
    import TrackInfo from './TrackInfo.svelte'
    import NumericalInput from './NumericalInput.svelte'
    // Midi/Track stay type-only imports; the runtime `new Midi(...)` calls below go through the
    // default-import interop shape instead (TonejsMidiPkg.Midi). @tonejs/midi's CJS build assigns
    // its named exports dynamically, which the ESM loader used during adapter-static prerendering
    // can't resolve as a value import - only the default-import-of-the-whole-module-exports shape
    // works. Same fix as RecordedSong.ts's toMidi().
    import type {Midi} from '@tonejs/midi'
    import TonejsMidiPkg from '@tonejs/midi'

    let {
        data,
        functions,
    }: {
        data: {
            instruments: InstrumentData[]
            selectedColumn: number
        }
        functions: {
            changeMidiVisibility: (override: boolean) => void
            changePitch: (pitch: Pitch) => void
            loadSong: (song: ComposedSong) => void
        }
    } = $props()

    let fileName = $state('')
    let tracks: CustomTrack[] = $state([])
    let bpm = $state(220)
    let offset = $state(0)
    let pitch: Pitch = $state('C')
    let accidentals = $state(0)
    let outOfRange = $state(0)
    let totalNotes = $state(0)
    let includeAccidentals = $state(true)
    // QUIRK: ignoreEmptytracks (not ignoreEmptyTracks) is an intentional preserved typo.
    let ignoreEmptytracks = $state(false)
    let warnedOfExperimental = false

    const midiInputsStyle = $derived(
        `background-color:${ThemeProvider.layer('primary', 0.2).toString()};color:${ThemeProvider.getText('primary').toString()}`
    )

    async function handleFile(files: FileElement<ArrayBuffer>[]) {
        try {
            if (files.length === 0) return
            const file = files[0]
            const name = file.file.name
            if (isVideoFormat(name)) {
                const audio = await extractAudio(file)
                parseAudioToMidi(audio, name)
            } else if (isAudioFormat(name)) {
                const audio = await extractAudio(file)
                parseAudioToMidi(audio, name)
            } else {
                const midi = new TonejsMidiPkg.Midi(file.data as ArrayBuffer)
                return mandleMidiFile(midi, name)
            }
        } catch (e) {
            console.error(e)
            logger.hidePill()
            logger.error(t('logs:error_opening_file'))
        }
    }

    async function extractAudio(audio: FileElement<ArrayBuffer>): Promise<AudioBuffer> {
        const ctx = new AudioContext({
            sampleRate: 22050,
        })
        const buffer = await new Promise((res, rej) => {
            ctx!.decodeAudioData(audio.data as ArrayBuffer, res, rej)
        }) as AudioBuffer
        ctx.close()
        return buffer
    }

    async function parseAudioToMidi(audio: AudioBuffer, name: string) {
        if (!warnedOfExperimental) logger.warn(t('composer:midi_parser.audio_conversion_warning'))
        warnedOfExperimental = true
        const frames: number[][] = []
        const onsets: number[][] = []
        const model = `${base}/assets/audio-midi-model.json`
        logger.showPill(`${t('composer:midi_parser.detecting_notes')}...`)
        const {BasicPitch, noteFramesToTime, outputToNotesPoly} = await basicPitchLoader()
        const basicPitch = new BasicPitch(model)
        const mono = audio.getChannelData(0)
        await basicPitch.evaluateModel(
            mono,
            (f, o) => {
                frames.push(...f);
                onsets.push(...o);
            },
            (progress) => {
                logger.showPill(`${t('composer:midi_parser.detecting_notes')}: ${Math.floor(progress * 100)}%...`)
            }
        )
        logger.showPill(t('composer:midi_parser.converting_audio_to_midi'))
        await delay(300)
        const notes = noteFramesToTime(
            outputToNotesPoly(
                frames,  //frames
                onsets, //onsets
                0.5,  //onsetThreshold
                0.3, //frameThreshold
                11,  //minimumDuration
                true, //inferOnsets
                3000, //maxHz
                0, //minHz
                true, //smooth
            )
        );
        const midi = new TonejsMidiPkg.Midi();
        const track = midi.addTrack()
        notes.forEach(note => {
            track.addNote({
                midi: note.pitchMidi,
                time: note.startTimeSeconds,
                duration: note.durationSeconds,
                velocity: note.amplitude,
            })
        })
        logger.hidePill()
        mandleMidiFile(midi, name)
    }

    // QUIRK: mandleMidiFile (not handleMidiFile) is an intentional preserved typo.
    function mandleMidiFile(midi: Midi, name: string) {
        try {
            const midiBpm = midi.header.tempos[0]?.bpm
            const key = midi.header.keySignatures[0]?.key
            tracks = midi.tracks.map((track, i) => {
                const customtrack: CustomTrack = {
                    track,
                    selected: true,
                    layer: 0,
                    name: track.name || `Track n.${i + 1}`,
                    numberOfAccidentals: 0,
                    maxScaling: 0,
                    outOfRangeBounds: {
                        lower: 0,
                        upper: 0
                    },
                    localOffset: null
                }
                return customtrack
            })
            fileName = name
            bpm = Math.floor(midiBpm * 4) || 220
            offset = 0
            // key is a plain string; `as never` lets it satisfy includes()'s readonly Pitch[] param type.
            pitch = (game.notes.pitches.includes(key as never) ? key : 'C') as Pitch
            if (tracks.length) convertMidi()
        } catch (e) {
            console.error(e)
            logger.error(t('composer:midi_parser.error_is_file_midi'))
        }
    }

    function convertMidi() {
        const selectedTracks = tracks.filter(track => track.selected)
        const notes: MidiNote[] = []
        let accidentalsCount = 0
        let outOfRangeCount = 0
        let totalNotesCount = 0
        selectedTracks.forEach(track => {
            track.numberOfAccidentals = 0
            track.outOfRangeBounds.upper = 0
            track.outOfRangeBounds.lower = 0
            track.track.notes.forEach(midiNote => {
                totalNotesCount++
                const note = MidiNote.fromMidi(
                    track.layer,
                    Math.floor(midiNote.time * 1000),
                    midiNote.midi - (track.localOffset ?? offset),
                    track.maxScaling
                )
                if (note.data.isAccidental) {
                    accidentalsCount++
                    track.numberOfAccidentals++
                }
                if (note.data.note !== -1) {
                    if (includeAccidentals || !note.data.isAccidental) {
                        notes.push(note)
                    }
                } else {
                    outOfRangeCount++
                    if (note.data.outOfRangeBound === -1) track.outOfRangeBounds.lower++
                    if (note.data.outOfRangeBound === 1) track.outOfRangeBounds.upper++
                }
            })
        })
        const sorted = notes.sort((a, b) => a.time - b.time)
        const bpmToMs = 60000 / bpm
        const groupedNotes: MidiNote[][] = []
        while (sorted.length > 0) {
            const row = [sorted.shift() as MidiNote]
            let amount = 0
            for (let i = 0; i < sorted.length; i++) {
                if (row[0].time > sorted[i].time - bpmToMs / 9) amount++
            }
            groupedNotes.push([...row, ...sorted.splice(0, amount)])
        }
        const columns: NoteColumn[] = []
        let previousTime = 0
        groupedNotes.forEach(notes => {
            const note = notes[0]
            if (!note) return
            const elapsedTime = note.time - previousTime
            const emptyColumns = Math.floor((elapsedTime - bpmToMs) / bpmToMs)
            const noteColumn = new NoteColumn()
            previousTime = note.time
            if (emptyColumns > -1) new Array(emptyColumns).fill(0).forEach(() => columns.push(new NoteColumn())) // adds empty columns
            noteColumn.notes = notes.map(note => {
                const layer = new NoteLayer()
                layer.set(note.layer, true)
                return new ColumnNote(note.data.note, layer)
            })
            columns.push(noteColumn)
        })
        columns.forEach(column => { //merges notes of different layer
            const groupedNotes = groupNotesByIndex(column)
            column.notes = groupedNotes.map(group => {
                group[0].layer = mergeLayers(group)
                return group[0]
            })
        })
        const song = new ComposedSong("Untitled")
        song.columns = columns
        song.bpm = bpm
        song.instruments = [] // dead assignment - overwritten unconditionally by the next line
        song.instruments = data.instruments.map(ins => ins.clone())
        song.pitch = pitch
        const lastColumn = data.selectedColumn
        song.selected = lastColumn < song.columns.length ? lastColumn : 0
        if (song.columns.length === 0) {
            return logger.warn(t('composer:midi_parser.there_are_no_notes'))
        }
        functions.loadSong(song)
        accidentals = accidentalsCount
        totalNotes = totalNotesCount
        outOfRange = outOfRangeCount
    }

    // data here shadows this component's own data prop - fine today since this function only
    // mutates tracks[index], but code added later that needs the outer prop would silently get
    // this local instead.
    function editTrack(index: number, data: Partial<CustomTrack>) {
        Object.assign(tracks[index], data)
        if (tracks.length > 0) convertMidi()
    }

    function changeOffset(value: number) {
        if (!Number.isInteger(value)) value = 0
        if (offset === value) return
        offset = value
        if (tracks.length > 0) convertMidi()
    }

    function changePitch(value: Pitch) {
        functions.changePitch(value)
        pitch = value
    }

    function toggleAccidentals() {
        includeAccidentals = !includeAccidentals
        if (tracks.length > 0) convertMidi()
    }

    function changeBpm(value: number) {
        if (!Number.isInteger(value)) value = 0
        if (bpm === value) return
        bpm = value
        if (tracks.length > 0) convertMidi()
    }
</script>

<DecoratedCard className="floating-midi" size="1.2rem" isRelative={false} offset="0.1rem">
    <Column className="floating-midi-content" gap="0.3rem">
        <Row className="separator-border" align="center" style="width:100%">
            <FilePicker onPick={handleFile} as="buffer">
                <button class="midi-btn" style="{midiInputsStyle};white-space:nowrap">
                    {t('composer:midi_parser.open_midi_audio_file')}
                </button>
            </FilePicker>
            <div style="margin:0 0.5rem" class="text-ellipsis">
                {fileName}
            </div>
            <button
                class="midi-btn"
                style="margin-left:auto;{midiInputsStyle}"
                onclick={() => functions.changeMidiVisibility(false)}
            >
                {t('common:close')}
            </button>
        </Row>

        <Row justify="between" align="center">
            <div style="margin-right:0.5rem">{t('common:bpm')}:</div>
            <NumericalInput value={bpm} onChange={changeBpm} delay={600} style={midiInputsStyle} step={5} />
        </Row>
        <Row justify="between" align="center">
            <div class="row flex-centered">
                <span style="margin-right:0.5rem">{t('composer:midi_parser.global_note_offset')}: </span>
                <HelpTooltip buttonStyle="width:1.2rem;height:1.2rem">
                    {t('composer:midi_parser.global_note_offset_description')}
                </HelpTooltip>
            </div>
            <NumericalInput value={offset} onChange={changeOffset} delay={600} style={midiInputsStyle} step={1} />
        </Row>
        <Row justify="between" align="center">
            <div style="margin-right:0.5rem">{t('common:pitch')}:</div>
            <PitchSelect style="width:5rem;{midiInputsStyle}" selected={pitch} onChange={changePitch} />
        </Row>
        <Row justify="between" align="center">
            <Row align="center">
                <div style="margin-right:0.5rem">{t('composer:midi_parser.include_accidentals')}:</div>
                <Switch checked={includeAccidentals} onchange={toggleAccidentals} styleOuter={midiInputsStyle} />
            </Row>
            <Row align="center">
                <div style="margin-right:0.5rem">{t('composer:midi_parser.ignore_empty_tracks')}:</div>
                <Switch checked={ignoreEmptytracks} onchange={(b) => ignoreEmptytracks = b} styleOuter={midiInputsStyle} />
            </Row>
        </Row>
        {#if tracks.length > 0}
            <Column className="separator-border" style="width:100%">
                <Column style="width:100%">
                    <div style="text-align:center">{t('composer:midi_parser.select_midi_tracks')}</div>
                    {#each tracks as track, i (i)}
                        {#if !(ignoreEmptytracks && track.track.notes.length === 0)}
                            <TrackInfo data={track} instruments={data.instruments} index={i} onChange={editTrack} />
                        {/if}
                    {/each}
                </Column>
            </Column>
        {/if}
        {#if tracks.length > 0}
            <table>
                <tbody>
                    <tr>
                        <td>{t('composer:midi_parser.total_notes')}:</td>
                        <td></td>
                        <td>{totalNotes}</td>
                    </tr>
                    <tr>
                        <td>{t('composer:midi_parser.accidentals')}:</td>
                        <td></td>
                        <td>{accidentals}</td>
                    </tr>
                    <tr>
                        <td>{t('composer:midi_parser.out_of_range')}:</td>
                        <td></td>
                        <td>{outOfRange}</td>
                    </tr>
                </tbody>
            </table>
        {/if}
    </Column>
</DecoratedCard>
