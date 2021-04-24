import React, { Component } from 'react'
import isMobile from "is-mobile"
class Note extends Component {
    constructor(props) {
        super(props)
        this.state = {
            
        }
    }
    render() {
        let data = this.props.data
        let className = data.clicked ? "note click-event" : "note"
        let toBeClicked = this.props.toBeClicked ? " note-red" : ""
        let toBeClickedNext = this.props.toBeClickedNext ? " note-border-click" : ""
        className += toBeClicked + toBeClickedNext
        let noteText = isMobile() ? data.noteNames.mobile : data.noteNames.keyboard
        let animation = {transition : `all ${this.props.fadeTime}s`}
        return <button 
            onPointerDown={() => this.props.clickAction(data)} 
            className="button-hitbox"
            
        >
            <div className={className} style={animation}>
                <img 
                    alt={data.noteNames.mobile}
                    src={`${window.location.origin}/assets/icons/keys/${data.noteNames.mobile}.svg`}>

                </img>
                <div className="note-name">
                    {noteText}
                </div>
            </div>
        </button>
    }
}



export default Note