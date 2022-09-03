import { APP_NAME } from "$/appConfig"
import { NoteData, NoteDataState } from "$/lib/Instrument"
import { makeObservable, observable } from "mobx"

class ZenKeyboardStore {
    @observable
    keyboard: NoteData[] = []
    constructor() {
        makeObservable(this)
    }

    setKeyboardLayout = (keyboard: NoteData[]) => { 
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
}

export const zenKeyboardStore = new ZenKeyboardStore()