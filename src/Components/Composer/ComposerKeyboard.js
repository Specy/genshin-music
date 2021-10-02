import React, { Component } from 'react'
import ComposerNote from "./ComposerNote"
import MultiSwitch from "./MultiSwitch"
import { keyNames, pitchArr , skyImages } from "../../appConfig"
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
                    let skyText = ""
                    let skyImg = ""
                    try{
                        skyText = keyNames[pitchArr.indexOf(data.pitch)][note.index]
                        skyImg = skyImages[data.keyboard.layout.length][note.index]     
                    }catch(e){}

                    return <ComposerNote
                        key={note.index}
                        layers={index >= 0 ? data.currentColumn.notes[index].layer : "000"}
                        data={note}
                        skyText={skyText}
                        skyImg={skyImg}
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