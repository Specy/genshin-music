import React, { Component } from 'react'

class ComposerTools extends Component{
    constructor(props){
        super(props)
        this.state = {
            
        }
    }
    render(){
        const {data, functions} = this.props
        let className = data.visible ? "floating-tools tools-visible" : "floating-tools"
        return <div className={className}>
            <div className="tools-row">
                <div>
                    Scroll to the left / right to select the columns (warning, there is no undo yet)
                </div>
                <button onClick={functions.toggleTools}>
                    Close
                </button>
            </div>
            <div className="tools-buttons-wrapper">
                <button 
                    disabled={data.copiedColumns.length !== 0}
                    onClick={functions.copyColumns}
                    className={data.copiedColumns.length !== 0 ? "tools-button-highlighted" : ""}    
                >
                    Copy
                </button>
                <button 
                    disabled={data.copiedColumns.length === 0}
                    onClick={functions.pasteColumns}
                >
                    Paste
                </button>
                <button 
                    disabled={data.copiedColumns.length !== 0}
                    onClick={functions.eraseColumns}
                >
                    Erase
                </button>
                <button 
                    disabled={data.copiedColumns.length !== 0}
                    onClick={functions.deleteColumns}
                >
                    Delete
                </button>
            </div>
        </div>
    }
}



export default ComposerTools