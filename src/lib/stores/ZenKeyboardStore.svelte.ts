// old: src/stores/ZenKeyboardStore.ts (33 lines) - mobx -> Svelte 5 runes port, same pattern as
// PlayerStore.svelte.ts/PlayerControlsStore.svelte.ts. `@observable keyboard` becomes `$state([])`;
// `makeObservable(this)` dropped. `animateNote` already called `ObservableNote.triggerAnimation`
// in old code (Phase-4a Task 2 port) - unchanged here. Import-path swaps: `$config` ->
// `$core/legacyConfig`; `$lib/audio/Instrument` -> `$lib/audio/Instrument.svelte`;
// `$/types/GeneralTypes` -> `$core/types` (`NoteStatus`, restored Phase-4a Task 2).
import {APP_NAME} from "$core/legacyConfig"
import {type NoteDataState, ObservableNote} from "$lib/audio/Instrument.svelte"
import type {NoteStatus} from "$core/types"

class ZenKeyboardStore {
    keyboard: ObservableNote[] = $state([])

    setKeyboardLayout = (keyboard: ObservableNote[]) => {
        this.keyboard.splice(0, this.keyboard.length, ...keyboard)
    }
    animateNote = (index: number, status?: NoteStatus) => {
        this.keyboard[index].triggerAnimation(status)
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
}

export const zenKeyboardStore = new ZenKeyboardStore()
