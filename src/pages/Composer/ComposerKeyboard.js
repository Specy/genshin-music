import ComposerNote from "./Components/ComposerNote"
import { getNoteText } from 'lib/Utils'
import MultiSwitch from "./Components/MultiSwitch"
import { LAYOUT_IMAGES, layersIndexes } from "appConfig"

export default function ComposerKeyboard({ data, functions }) {
    let notesIndexes = data.currentColumn.notes.map((e) => e.index)
    let hiddenSideMenu = data.isPlaying ? " hidden" : ""
    let keyboardClass = "keyboard"
    if (data.keyboard.layout.length === 15) keyboardClass += " keyboard-5"
    if (data.keyboard.layout.length === 8) keyboardClass += " keyboard-4"
    return <div>
        <div className={keyboardClass}>
            {data.keyboard.layout.length === 0 ? <div className="loading">Loading...</div> : null}
            {data.keyboard.layout.map((note, i) => {
                let index = notesIndexes.indexOf(i)
                let noteText = ""
                let noteImage = ""
                try {
                    noteImage = LAYOUT_IMAGES[data.keyboard.layout.length][note.index]
                    noteText = getNoteText(data.noteNameType, note.index, data.pitch, data.keyboard.layout.length)
                } catch (e) { }
                return <ComposerNote
                    key={note.index}
                    layers={index >= 0 ? data.currentColumn.notes[index].layer : "000"}
                    data={note}
                    noteText={noteText}
                    instrument={data.keyboard.instrumentName}
                    noteImage={noteImage}
                    clickAction={functions.handleClick}
                />
            })}
        </div>
        <div className={"bottom-right-wrapper" + hiddenSideMenu}>
            <div className={"layer-buttons-wrapper"}>
                <div className="bottom-right-text">
                    Layer
                </div>
                <MultiSwitch
                    buttonsClass={"layer-button"}
                    options={layersIndexes}
                    onSelect={functions.changeLayer}
                    selected={data.layer}
                />
            </div>
            <div className="tempo-changers-wrapper">
                <div className="bottom-right-text">
                    Tempo
                </div>
                {data.TempoChangers.map((e) => {
                    return <button
                        key={e.id}
                        onClick={() => functions.handleTempoChanger(e)}
                        style={{ backgroundColor: "#" + e.color.toString(16) }}
                    >
                        {e.text}
                    </button>
                })}
            </div>
        </div>
    </div>
}