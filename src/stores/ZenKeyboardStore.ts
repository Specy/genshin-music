import { APP_NAME } from "$/Config"
import { ObservableNote, NoteDataState } from "$/lib/Instrument"
import { NoteStatus } from "$/types/GeneralTypes"
import { makeObservable, observable } from "mobx"

class ZenKeyboardStore {
    @observable
    keyboard: ObservableNote[] = []
    constructor() {
        makeObservable(this)
    }

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