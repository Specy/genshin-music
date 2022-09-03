import { useObservableArray } from "$/lib/Hooks/useObservable";
import Instrument, { NoteData } from "$/lib/Instrument";
import { zenKeyboardStore } from "$/stores/ZenKeyboardStore";
import { ZenNote } from "./ZenNote";
import { useEffect } from 'react'
import { Pitch } from "$/appConfig";
import { KeyboardProvider } from "$/lib/Providers/KeyboardProvider";
import { NoteNameType } from "$/types/GeneralTypes";

interface ZenKeyboardProps {
    instrument: Instrument
    pitch: Pitch
    scale: number
    noteNameType: NoteNameType
    verticalOffset: number
    onNoteClick: (note: NoteData) => void
}

export function ZenKeypad({ onNoteClick, instrument, pitch, verticalOffset, scale,noteNameType }: ZenKeyboardProps) {
    const layout = useObservableArray(zenKeyboardStore.keyboard)
    useEffect(() => {
        KeyboardProvider.listen(({ letter }) => {
            const note = instrument.getNoteFromCode(letter)
            if (note !== null) onNoteClick(instrument.notes[note])
        }, { id: "ZenKeyboard" })
        return () => KeyboardProvider.unregisterById("ZenKeyboard")
    }, [onNoteClick])
    let keyboardClass = "keyboard zen-keyboard"
    if (instrument.notes.length === 15) keyboardClass += " keyboard-5"
    if (instrument.notes.length === 8) keyboardClass += " keyboard-4"
    return <div className={keyboardClass}
        style={{
            transform: `scale(${scale / 100}) translateY(${verticalOffset}px)`,
        }}
    >
        {layout.map((note, index) =>
            <ZenNote
                key={index}
                instrumentName={instrument.name}
                noteText={instrument.getNoteText(index, noteNameType, pitch)}
                noteImage={note.noteImage}
                note={note}
                onClick={onNoteClick}
            />
        )}

    </div>
}