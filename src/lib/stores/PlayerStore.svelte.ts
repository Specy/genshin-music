// old: src/stores/PlayerStore.ts (120 lines) - mobx -> Svelte 5 runes port. `@observable state`/
// `@observable keyboard` become `$state(...)`; `makeObservable(this)`/`@action` decorators are
// dropped outright (no mobx dependency anywhere in this tree - same precedent as every other
// ported store, e.g. GlobalConfigStore.svelte.ts). Getters and method bodies (incl. the
// `key`/`playId` increment bookkeeping that later UI effects key off of - see
// PlayerControlsStore.svelte.ts sibling and the Player/PlayerKeyboard consumers in later 4b
// tasks) are byte-verbatim. Import-path swaps only: `$config` -> `$core/legacyConfig` (this file
// lives under src/lib/stores/ - non-UI tier per the two-tier rule, so the direct
// `APP_NAME === 'Genshin' ? 100 : 200` branch below is kept as-is, matching
// ObservableNote.resetKeyboardLayout's own identical branch); `$lib/audio/Instrument` ->
// `$lib/audio/Instrument.svelte` (Phase-4a Task 2 port); `$lib/Songs/ComposedSong`/`RecordedSong`
// -> `$core/Songs/ComposedSong`/`RecordedSong`.
//
// Note for reviewer: `state.song` holds a raw ComposedSong/RecordedSong class instance inside a
// `$state`-wrapped object. Svelte 5's state proxy only deep-wraps plain objects/arrays (and
// Map/Set/Date) - a class instance with a custom prototype is stored by reference, unproxied
// (matches how ObservableNote itself needed its own internal `$state` field rather than relying on
// outer-array wrapping). `instanceof RecordedSong`/`instanceof ComposedSong` checks on
// `playerStore.song` downstream therefore see the real instance, not a proxy - safe, and behaves
// the same as mobx's old shallow-observable(this) treatment of non-plain values.
import {APP_NAME} from "$core/legacyConfig"
import {type NoteDataState, ObservableNote} from "$lib/audio/Instrument.svelte"
import {ComposedSong} from "$core/Songs/ComposedSong"
import {RecordedSong} from "$core/Songs/RecordedSong"

type eventType = "play" | "practice" | "approaching" | "stop"
type SongTypes = RecordedSong | ComposedSong | null
type SongTypesNonNull = RecordedSong | ComposedSong
type PlayerStoreState = {
    key: number
    song: SongTypes,
    playId: number,
    eventType: eventType,
    start: number,
    end: number,
}

class PlayerStore {
    state: PlayerStoreState = $state({
        key: 0,
        song: null,
        playId: 0,
        eventType: 'stop',
        start: 0,
        end: 0
    })
    keyboard: ObservableNote[] = $state([])

    get song(): RecordedSong | ComposedSong | null {
        return this.state.song
    }

    get eventType(): eventType {
        return this.state.eventType
    }

    get start(): number {
        return this.state.start
    }

    setKeyboardLayout = (keyboard: ObservableNote[]) => {
        this.keyboard.splice(0, this.keyboard.length, ...keyboard)
    }
    resetKeyboardLayout = () => {
        this.keyboard.forEach(note => note.setState({
            status: '',
            delay: APP_NAME === 'Genshin' ? 100 : 200
        }))
    }
    resetOutgoingAnimation = () => {
        this.keyboard.forEach(n => n.setState({animationId: 0}))
    }
    setNoteState = (index: number, state: Partial<NoteDataState>) => {
        this.keyboard[index].setState(state)
    }
    setState = (state: Partial<PlayerStoreState>) => {
        Object.assign(this.state, state)
    }
    play = (song: SongTypesNonNull, start: number = 0, end?: number) => {
        this.setState({
            song,
            start,
            eventType: 'play',
            end,
            key: this.state.key + 1,
            playId: this.state.playId + 1
        })
    }
    practice = (song: SongTypesNonNull, start: number = 0, end: number) => {
        this.setState({
            song,
            start,
            eventType: 'practice',
            end,
            key: this.state.key + 1,
            playId: this.state.playId + 1
        })
    }
    approaching = (song: SongTypesNonNull, start: number = 0, end: number) => {
        this.setState({
            song,
            start,
            eventType: 'approaching',
            end,
            key: this.state.key + 1,
            playId: this.state.playId + 1
        })
    }
    resetSong = () => {
        this.setState({
            song: null,
            eventType: 'stop',
            start: 0,
            end: 0,
            key: this.state.key + 1,
            playId: 0
        })
    }
    restartSong = (start: number, end: number) => {
        this.setState({
            start,
            end,
            key: this.state.key + 1,
            playId: this.state.playId + 1
        })
    }
}

export const playerStore = new PlayerStore()
