
import ComposerNote from "$cmp/Composer/ComposerNote"
import { Column, InstrumentData } from "$lib/Songs/SongClasses"
import { Pitch, TEMPO_CHANGERS } from "$/appConfig"
import { ThemeProvider } from "$stores/ThemeStore/ThemeProvider"
import Instrument, { NoteData } from "$lib/Instrument"
import { NoteNameType } from "$types/GeneralTypes"

interface ComposerKeyboardProps {
    data: {
        keyboard: Instrument
        instruments: InstrumentData[]
        isRecordingAudio: boolean
        currentLayer: number,
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
    const { keyboard, isPlaying, noteNameType, currentColumn, pitch, currentLayer, isRecordingAudio } = data
    const { handleClick, handleTempoChanger } = functions
    if (keyboard === undefined) {
        return <div className="composer-keyboard-wrapper" style={{ marginBottom: '4rem' }}>
            <h1>There was an error with this layer</h1>
        </div>
    }
    if (isRecordingAudio) {
        return <div className="composer-keyboard-wrapper" style={{ marginBottom: '4rem' }}>
            <h1>
                Recording Audio...
            </h1>
        </div>
    }
    let keyboardClass = "keyboard"
    if (keyboard.notes.length === 15) keyboardClass += " keyboard-5"
    if (keyboard.notes.length === 8) keyboardClass += " keyboard-4"

    return <>
        <div className="composer-keyboard-wrapper">
            <div
                className={keyboardClass}
            >
                {keyboard.notes.length === 0 ? <div className="loading">Loading...</div> : null}
                {keyboard.notes.map((note, i) => {
                    try {
                        const index = currentColumn.notes.findIndex((e) => e.index === i)

                        return <ComposerNote
                            key={note.index}
                            layer={(index >= 0
                                ? currentColumn.notes[index].layer.toLayerStatus(currentLayer, data.instruments)
                                : 0
                            )}
                            data={note}
                            noteText={keyboard.getNoteText(i, noteNameType, pitch)}
                            instrument={keyboard.name}
                            noteImage={note.noteImage}
                            clickAction={handleClick}
                        />
                    } catch (e) {
                        return 'Err'
                    }
                })}
            </div>

        </div>
        <div className={`tempo-changers-wrapper ${isPlaying ? "tempo-changers-wrapper-hidden" : ""}`}>
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
                            : { backgroundColor: "#" + tempoChanger.color.toString(16) })
                        ,
                        outline: data.currentColumn.tempoChanger === tempoChanger.id
                            ? `3px ${ThemeProvider.get('composer_accent').toString()} solid`
                            : '',
                        margin: '',
                        outlineOffset: '-3px'
                    }}
                >
                    {tempoChanger.text}
                </button>
            })}
        </div>
    </>
}