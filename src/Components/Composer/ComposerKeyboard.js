import React, { Component } from 'react'
import ComposerNote from "./ComposerNote"
import MultiSwitch from "./MultiSwitch"
class ComposerKeyboard extends Component {
    constructor(props) {
        super(props)
        this.state = {

        }

    }

    render() {
        const { data, functions } = this.props
        let notesIndexes = data.currentColumn.notes.map((e) => e.index)
        return <div>
            <div className="keyboard">
                {data.keyboard.layout.map((note, i) => {
                    return <ComposerNote
                        key={note.index}
                        selected={notesIndexes.includes(i)}
                        data={note}
                        clickAction={functions.handleClick}
                    />
                })}
            </div>
            <div className="bottom-right-wrapper">
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