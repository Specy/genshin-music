import React, { Component } from 'react'
import "./menu.css"
class Menu extends Component{
    constructor(props){
        super(props)
    }
    render(){
        return <div className="menu">
            <MenuItem>A</MenuItem>
            <MenuItem>B</MenuItem>
            <MenuItem>C</MenuItem>
            <MenuItem>D</MenuItem>
        </div>
    }
}


class MenuItem extends Component{
    constructor(props){
        super(props)
    }
    render(){
        return <div className="menu-item">
            {this.props.children}
        </div>
    }
}
export default Menu