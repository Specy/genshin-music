
import ComposerNote from "$cmp/Composer/ComposerNote"
import { Column, InstrumentData } from "$lib/Songs/SongClasses"
import { NoteNameType, Pitch, TEMPO_CHANGERS } from "$/Config"
import Instrument, { ObservableNote } from "$lib/Instrument"
import { ComposerSettingsDataType } from "$/lib/BaseSettings"
import { FaChevronLeft, FaChevronRight } from "react-icons/fa"
import { useTheme } from "$/lib/Hooks/useTheme"

interface ComposerKeyboardProps {
    data: {
        keyboard: Instrument
        instruments: InstrumentData[]
        isRecordingAudio: boolean
        currentLayer: number,
        currentColumn: Column,
        pitch: Pitch,
        settings: ComposerSettingsDataType
        isPlaying: boolean,
        noteNameType: NoteNameType
    },
    functions: {
        handleClick: (note: ObservableNote) => void
        selectColumnFromDirection: (direction: number) => void
        handleTempoChanger: (tempoChanger: typeof TEMPO_CHANGERS[number]) => void
    }
}

export default function ComposerKeyboard({ data, functions }: ComposerKeyboardProps) {
    const { keyboard, isPlaying, noteNameType, currentColumn, pitch, currentLayer, isRecordingAudio, settings } = data
    const { handleClick, handleTempoChanger } = functions
    const [theme] = useTheme()
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
    if (keyboard.notes.length === 14) keyboardClass += " keyboard-5"
    if (keyboard.notes.length === 8) keyboardClass += " keyboard-4"
    if (keyboard.notes.length === 6) keyboardClass += " keyboard-3"

    return <>
        <div className="composer-keyboard-wrapper">
            {data.settings.useKeyboardSideButtons.value &&
                <button
                    onPointerDown={() => functions.selectColumnFromDirection(-1)}
                    className={`keyboard-column-selection-buttons ${!data.isPlaying ? 'keyboard-column-selection-buttons-visible' : ''}`}
                    style={{
                        paddingRight: '0.5rem',
                        justifyContent: "flex-end",
                    }}
                >
                    <FaChevronLeft />
                </button>
            }
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
            {data.settings.useKeyboardSideButtons.value &&
                <button
                    onPointerDown={() => functions.selectColumnFromDirection(1)}
                    className={`keyboard-column-selection-buttons ${!data.isPlaying ? 'keyboard-column-selection-buttons-visible' : ''}`}
                    style={{
                        paddingLeft: '0.5rem',
                        justifyContent: "flex-start",
                    }}
                >
                    <FaChevronRight />
                </button>
            }
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
                                backgroundColor: theme.get('primary').toString(),
                                color: theme.getText('primary').toString()
                            }
                            : { backgroundColor: "#" + tempoChanger.color.toString(16) })
                        ,
                        outline: data.currentColumn.tempoChanger === tempoChanger.id
                            ? `3px ${theme.get('composer_accent').toString()} solid`
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