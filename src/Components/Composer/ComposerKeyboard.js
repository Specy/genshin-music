import React, { Component } from 'react'
import ComposerNote from "./ComposerNote"
import MultiSwitch from "./MultiSwitch"
import { appName, keyNames, pitchArr , layoutImages,layoutData } from "../../appConfig"
class ComposerKeyboard extends Component {
    constructor(props) {
        super(props)
        this.state = {

        }

    }

    render() {
        const { data, functions } = this.props
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
                    try{    
                        noteImage = layoutImages[data.keyboard.layout.length][note.index]  
                        if(data.noteNameType === "Note name") noteText = keyNames[appName][pitchArr.indexOf(data.pitch)][note.index]
                        if(data.noteNameType === "Keyboard layout") noteText = layoutData[data.keyboard.layout.length].keyboardLayout[note.index]
                        if(data.noteNameType === "Do Re Mi") noteText = layoutData[data.keyboard.layout.length].mobileLayout[note.index]
                    }catch(e){}
                    return <ComposerNote
                        key={note.index}
                        layers={index >= 0 ? data.currentColumn.notes[index].layer : "000"}
                        data={note}
                        noteText={noteText}
                        noteImage={`./assets/icons/keys/${noteImage}.svg`}
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
                        selectedColor={"#63aea7"}
                        options={[1, 2, 3]}
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
}



export default ComposerKeyboard