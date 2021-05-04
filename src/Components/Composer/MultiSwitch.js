import React, { Component } from 'react'

class MultiSwitch extends Component {
    constructor(props) {
        super(props)
        this.state = {

        }
    }

    render() {
        let props = this.props
        return <>
            {props.options.map(e => {
                return <button
                    style={{ backgroundColor: e === props.selected ? props.selectedColor : "" }}
                    className={props.buttonsClass}
                    onClick={() => props.onSelect(e)}
                    key={e}
                >
                    {e}
                </button>
            })}
        </>
    }
}



export default MultiSwitch

