import { useObservableArray } from "$lib/Hooks/useObservable";
import Instrument, { ObservableNote } from "$lib/Instrument";
import { zenKeyboardStore } from "$stores/ZenKeyboardStore";
import { ZenNote } from "./ZenNote";
import { useEffect } from 'react'
import { NoteNameType, Pitch } from "$config";
import { KeyboardProvider } from "$lib/Providers/KeyboardProvider";
import { createKeyboardListener } from "$stores/KeybindsStore";

interface ZenKeyboardProps {
    instrument: Instrument
    pitch: Pitch
    scale: number
    noteNameType: NoteNameType
    verticalOffset: number
    onNoteClick: (note: ObservableNote) => void
}

export function ZenKeypad({ onNoteClick, instrument, pitch, verticalOffset, scale,noteNameType }: ZenKeyboardProps) {
    const layout = useObservableArray(zenKeyboardStore.keyboard)
    useEffect(() => {
        return createKeyboardListener("zen_keyboard", ({ shortcut, event }) => {
            if(event.repeat) return
            const note = instrument.getNoteFromCode(shortcut)
            if (note !== null) onNoteClick(note)
        })
    }, [onNoteClick, instrument])
    let keyboardClass = "keyboard zen-keyboard"
    if (instrument.notes.length === 15) keyboardClass += " keyboard-5"
    if (instrument.notes.length === 14) keyboardClass += " keyboard-5"
    if (instrument.notes.length === 8) keyboardClass += " keyboard-4"
    if (instrument.notes.length === 6) keyboardClass += " keyboard-3"
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