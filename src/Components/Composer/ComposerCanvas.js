import React, { Component } from 'react'
import * as PIXI from "pixi.js"
import { Stage, Container, Graphics, Sprite } from '@inlet/react-pixi';
import "./Composer.css"
const NumOfColumnsPerCanvas = 40
const noteMargin = window.screen.availWidth < 800 ? 2 : 4
const selectedColor = 0x1a968b//0x414a59
const columnBackgrounds = [0x515c6f, 0x414a59]
const noteBorder = window.screen.availWidth < 800 ? 2 : 3
class ComposerCanvas extends Component {
    constructor(props) {
        super(props)
        let width = nearestEven(window.screen.availWidth * 0.7)
        let height = nearestEven(window.screen.availHeight * 0.45)
        this.state = {
            width: width,
            height: height,
            column: {
                width: calcMinColumnWidth(nearestEven(width)),
                height: height
            }
        }
        this.cache = {
            columns:{
        
            },
            notes:{
                "0x515c6f": new PIXI.Sprite()
            }
        }
        this.stageSelected = false
        this.sliderSelected = false
        this.stagePreviousPositon = 0
        this.throttleStage = 0
        this.initCache()
    }
    resetPointerDown = (e) => {
        this.stageSelected = false
        this.sliderSelected = false
        this.stagePreviousPositon = 0
    }
    componentDidMount(){
        window.addEventListener("pointerup",this.resetPointerDown)
    }
    componentWillUnmount(){
        window.removeEventListener("pointerup",this.resetPointerDown)
    }
    handleClick = (e,type) => {
        let x = e.data.global.x
        if(type === "click"){
            let totalWidth = this.state.column.width * this.props.data.columns.length

            let relativePos = Math.floor(x / this.state.width * totalWidth / this.state.column.width)
            this.props.functions.selectColumn(relativePos)
        }
        if(type === "up"){
            this.sliderSelected = false
        }
        if(type === "down"){
            this.sliderSelected = true
        }
        if(type === "downStage"){
            this.stagePreviousPositon = x
            this.stageSelected = true
        }
    }
    handleStageSlide = (e) => {
        let x = e.data.global.x
        if(this.stageSelected === true){
            this.throttleStage++
            if(this.throttleStage < 4) return
            this.throttleStage = 0
            let isMovingLeft = this.stagePreviousPositon < x 
            let amount = Math.floor(Math.abs(this.stagePreviousPositon - x) / 4)
            if(amount > 4) amount = 4
            let toAdd = isMovingLeft ? -1: 1
            this.stagePreviousPositon = x
            if(this.props.data.selected === this.props.data.selected + toAdd * amount) return
            this.props.functions.selectColumn(this.props.data.selected + toAdd * amount,true)
        }
    }
    handleSlide = (e) => {
        if(this.sliderSelected){
            this.throttleStage++
            if(this.throttleStage < 4) return
            this.throttleStage = 0
            let totalWidth = this.state.column.width * this.props.data.columns.length
            let x = e.data.global.x
            let relativePos = Math.floor(x / this.state.width * totalWidth / this.state.column.width)
            this.props.functions.selectColumn(relativePos,true)
        }
    }
    initCache = () => {

    }

    render() {
        let s = this.state
        let pixiOptions = {
            backgroundColor: 0x495466,
            antialias: true
        }
        const { data, functions } = this.props
        let sizes = this.state.column
        let xPos = (data.selected - NumOfColumnsPerCanvas / 2 + 1) * - sizes.width
        let timeLineWidth = 30
        let counter = 0
        let switcher = false
        return <div className="canvas-wrapper">
            <Stage
                width={s.width}
                height={s.height}
                options={pixiOptions}
            >
                <Container
                    anchor={[0.5, 0.5]}
                    x={xPos}
                    interactive = {true}
                    pointerdown={(e) => this.handleClick(e, "downStage")}
                    pointermove = {(e) => this.handleStageSlide(e)}
                >
                    {data.columns.map((column, i) => {
                        if (counter > 15) {
                            switcher = !switcher
                            counter = 0
                        }
                        counter++
                        if (!isVisible(i, data.selected)) return null
                        let standardBg = columnBackgrounds[Number(switcher)] // boolean is 1 or 0
                        let bgColor = column.tempoDivider === 1 ? standardBg : column.color
                        return <Column
                        cache={this.cache}
                        key={i}
                        data={column}
                        index={i}
                        sizes={sizes}
                        bgColor={bgColor}
                        click={functions.selectColumn}
                        isSelected={i === data.selected}
                    />

                    })}
                </Container>
            </Stage>
            <Stage
                width={s.width}
                height={timeLineWidth}
            >
                <Timeline
                    handleClick={this.handleClick}
                    handleSlide={this.handleSlide}
                    windowWidth={s.width}
                    xPos={xPos}
                    height={timeLineWidth}
                    totalWidth={sizes.width * data.columns.length}
                    breakPointsThreshold={16}
                    numOfColumns={data.columns.length}
                >

                </Timeline>
            </Stage>
        </div>
    }
}



//Thanks Rubikium
function Timeline(props) {
    const { windowWidth, xPos, totalWidth, height,
         numOfColumns, breakPointsThreshold, handleClick, handleSlide} = props
    let stageSize = Math.floor(windowWidth / (totalWidth / windowWidth))
    if (stageSize > windowWidth) stageSize = windowWidth
    let stagePos = ((- xPos + windowWidth / 2) / totalWidth) * (windowWidth - stageSize) + 1
    function drawStage(g) {
        g.clear()
        g.lineStyle(3, 0x1a968b, 0.8)
        g.drawRoundedRect(stagePos, 2, stageSize - 2, height - 4, 6)
    }

    function drawBg(g) {
        g.beginFill(0x515c6f, 1)
        g.drawRect(0, 0, windowWidth, height)
    }
    let numOfBreakpoints = Math.floor(numOfColumns / breakPointsThreshold)
    let sections = windowWidth / numOfBreakpoints
    let breakpoints = new Array(numOfBreakpoints).fill().map((e, i) => {
        return {
            x: sections * i,
            num: i
        }
    })
    return <Container
        width={windowWidth}
        height={30}
        interactive={true}
        click={(e) => handleClick(e,"click")}
        pointerdown={(e) => handleClick(e,"down")}
        pointerup={(e) => handleClick(e,"up")}
        pointermove={handleSlide}
    >
        <Graphics draw={drawBg} />


        <Graphics draw={drawStage} />
    </Container>
}

/*
        {breakpoints.map(e => <Text 
                                text={e.num}
                                x={e.x}
                                y={(height - textStyle.fontSize) / 2}
                                style={textStyle}
                            />
        
        )}


*/
function Column(props) {
    let { data, index, sizes, click, isSelected, bgColor,cache } = props
    let color = isSelected ? selectedColor : bgColor
    function drawBg(g) {
        g.clear()
        g.beginFill(color, 1)
        g.drawRect(0, 0, sizes.width, sizes.height)
        data.notes.forEach(note => {
            g.beginFill(note.color, 1)
            g.drawRoundedRect(noteMargin, positions[note.index] * sizes.height / 21, noteWidth, noteHeight, noteBorder)
            g.endFill()
        })
        g.lineStyle(1, 0x00000, 0.8)
        g.moveTo(sizes.width, 0)
        g.lineTo(sizes.width, sizes.height)
        g.moveTo(0, 0)
        g.lineTo(0, sizes.height)
    }
    let noteHeight = sizes.height / 21 - (noteMargin * 2)
    let noteWidth = sizes.width - (noteMargin * 2)
    function drawNote(g, note) {
        g.clear()
        g.beginFill(note.color, 1)
        g.drawRoundedRect(noteMargin, positions[note.index] * sizes.height / 21, noteWidth, noteHeight, noteBorder)
        g.endFill()
    }
    //index color
    return <Container
        pointertap={() => click(index)}
        interactive={true}
        x={sizes.width * index}
    >
        <Graphics draw={drawBg} />
    </Container>
}

/*
        {data.notes.map((note) => {
            return <Graphics draw={(g) => drawNote(g, note)} />
        })}

*/
function calcMinColumnWidth(parentWidth) {
    return nearestEven(parentWidth / NumOfColumnsPerCanvas)
}
function nearestEven(num) {
    return 2 * Math.round(num / 2);
}
function isVisible(pos, currentPos) {
    let threshold = NumOfColumnsPerCanvas / 2 + 2
    let boundaries = [currentPos - threshold, currentPos + threshold]
    return boundaries[0] < pos && pos < boundaries[1]
}
const positions = [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0, 1, 2, 3, 4, 5, 6]
export default ComposerCanvas