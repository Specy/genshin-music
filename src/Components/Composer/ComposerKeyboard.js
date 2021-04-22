import React, { Component } from 'react'
import ComposerNote from "./ComposerNote"
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
            <div className="tempo-changers-wrapper">
                {data.TempoChangers.map((e) => {
                    return <button
                        key={e.id}
                        onClick={() => functions.handleTempoChanger(e)}
                        style={{backgroundColor: "#" + e.color.toString(16)}}
                    >
                        {e.text}
                    </button>
                })}
            </div>
        </div>
    }
}



export default ComposerKeyboard