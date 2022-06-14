import ComposerNote from "components/Composer/ComposerNote"
import { getNoteText } from 'lib/Tools'
import { Column } from "lib/Songs/SongClasses"
import { LAYOUT_IMAGES, Pitch, TEMPO_CHANGERS } from "appConfig"
import { ThemeProvider } from "stores/ThemeStore"
import Instrument, { NoteData } from "lib/Instrument"
import { NoteNameType } from "types/GeneralTypes"
import { NoteImage } from "types/Keyboard"
import { NoteLayer } from "lib/Layer"

interface ComposerKeyboardProps {
    data: {
        keyboard: Instrument,
        currentColumn: Column,
        pitch: Pitch,
        isPlaying: boolean,
        noteNameType: NoteNameType
    },
    functions: {
        handleClick: (note: NoteData) => void
        handleTempoChanger: (tempoChanger: typeof TEMPO_CHANGERS[number]) => void
    }
}

export default function ComposerKeyboard({ data, functions }: ComposerKeyboardProps) {
    const { keyboard, isPlaying, noteNameType, currentColumn, pitch} = data
    const { handleClick, handleTempoChanger } = functions
    let keyboardClass = "keyboard"
    if (keyboard.layout.length === 15) keyboardClass += " keyboard-5"
    if (keyboard.layout.length === 8) keyboardClass += " keyboard-4"
    return <>
        <div className={keyboardClass}>
            {keyboard.layout.length === 0 ? <div className="loading">Loading...</div> : null}
            {keyboard.layout.map((note, i) => {
                try {
                    const index = currentColumn.notes.findIndex((e) => e.index === i)
                    //@ts-ignore
                    const noteImage = LAYOUT_IMAGES[keyboard.layout.length][note.index]
                    const noteText = getNoteText(noteNameType, note.index, pitch, keyboard.layout.length as 8 | 15 | 21)
                    return <ComposerNote
                        key={note.index}
                        layer={(index >= 0 ? currentColumn.notes[index].layer : NoteLayer.EMPTY_LAYER).legacyString}
                        data={note}
                        noteText={noteText}
                        instrument={keyboard.name}
                        noteImage={noteImage as NoteImage}
                        clickAction={handleClick}
                    />
                } catch (e) {
                    return 'Err'
                }
            })}
        </div>
        <div className={"bottom-right-wrapper" + (isPlaying ? " hidden" : "")}>
            <div className="tempo-changers-wrapper">
                <div className="bottom-right-text">
                    Tempo
                </div>
                {TEMPO_CHANGERS.map((tempoChanger) => {
                    return <button
                        key={tempoChanger.id}
                        onClick={() => handleTempoChanger(tempoChanger)}
                        style={{
                            ...(tempoChanger.changer === 1
                            ? {
                                backgroundColor: ThemeProvider.get('primary').toString(),
                                color: ThemeProvider.getText('primary').toString()
                            }
                            : { backgroundColor: "#" + tempoChanger.color.toString(16) }),
                            outline: data.currentColumn.tempoChanger === tempoChanger.id 
                                ? `3px ${ThemeProvider.get('composer_accent').toString()} solid` 
                                : '',
                            outlineOffset: '-3px'
                        }}
                    >
                        {tempoChanger.text}
                    </button>
                })}
            </div>
        </div>
    </>
}