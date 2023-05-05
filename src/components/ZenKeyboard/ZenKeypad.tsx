import { useObservableArray } from "$lib/Hooks/useObservable";
import Instrument, { ObservableNote } from "$lib/Instrument";
import { zenKeyboardStore } from "$stores/ZenKeyboardStore";
import { ZenNote } from "./ZenNote";
import { useEffect } from 'react'
import { NoteNameType, Pitch } from "$config";
import { createKeyboardListener } from "$stores/KeybindsStore";
import s from './ZenKeyboard.module.css'

interface ZenKeyboardProps {
    instrument: Instrument
    pitch: Pitch
    scale: number
    noteNameType: NoteNameType
    verticalOffset: number
    onNoteClick: (note: ObservableNote) => void
}
let cssBase = `keyboard ${s['zen-keyboard']}}`
const keyboardClasses = new Map<number, string>([
    [15, `${cssBase} keyboard-5`],
    [14, `${cssBase} keyboard-5`],
    [8, `${cssBase} keyboard-4`],
    [6, `${cssBase} keyboard-3`],
])

export function ZenKeypad({ onNoteClick, instrument, pitch, verticalOffset, scale, noteNameType }: ZenKeyboardProps) {
    const layout = useObservableArray(zenKeyboardStore.keyboard)
    useEffect(() => {
        return createKeyboardListener("zen_keyboard", ({ shortcut, event }) => {
            if (event.repeat) return
            const note = instrument.getNoteFromCode(shortcut.name)
            if (note !== null) onNoteClick(note)
        })
    }, [onNoteClick, instrument])
    let keyboardClass = keyboardClasses.get(layout.length) || cssBase
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