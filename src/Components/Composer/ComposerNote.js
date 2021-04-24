import React, { Component } from 'react'
import isMobile from "is-mobile"
class ComposerNote extends Component{
    constructor(props){
        super(props)
        this.state = {
            
        }
    }
    shouldComponentUpdate(next,prev){
      return this.props.selected !== next.selected
    }
    render() {
        let data = this.props.data
        let className = this.props.selected ? "note-composer note-red" : "note-composer"
        let noteText = isMobile() ? data.noteNames.mobile : data.noteNames.keyboard
        return <button onPointerDown={() => this.props.clickAction(data)} className="button-hitbox">
            <div className={className} >
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



export default ComposerNote