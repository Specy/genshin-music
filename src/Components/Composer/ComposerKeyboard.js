import React, { Component } from 'react'
import ComposerNote from "./ComposerNote"
class ComposerKeyboard extends Component{
    constructor(props){
        super(props)
        this.state = {
            
        }
        
    }
    render() {
        const {data, functions} = this.props
        let notesIndexes = data.currentColumn.notes.map((e) => e.index)
        return <div className="keyboard">
            {data.keyboard.layout.map((note,i) => {
                return <ComposerNote
                    key={note.index}
                    selected={notesIndexes.includes(i) }
                    data={note}
                    clickAction={functions.handleClick}
                />
            })}
        </div>
    }
}



export default ComposerKeyboard