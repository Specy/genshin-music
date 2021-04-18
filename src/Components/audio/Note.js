import React, { Component } from 'react'

class Note extends Component {
    constructor(props) {
        super(props)
    }
    render() {
        let data = this.props.data
        let className = data.clicked ? "note click-event" : "note"
        let toBeClicked = this.props.toBeClicked ? " note-red" : ""
        let toBeClickedNext = this.props.toBeClickedNext ? " note-border-click" : ""
        className += toBeClicked + toBeClickedNext
        return <button onPointerDown={() => this.props.clickAction(data)} className="button-hitbox">
            <div className={className} >
                {data.noteNames.keyboard}
                <div className="note-name">
                    {data.noteNames.mobile}
                </div>
            </div>
        </button>
    }
}



export default Note