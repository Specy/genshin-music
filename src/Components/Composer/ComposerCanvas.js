import React, { Component } from 'react'
import * as PIXI from "pixi.js"
import { Stage, Container, Graphics, Sprite, ParticleContainer} from '@inlet/react-pixi';
import { ComposerCache } from "./ComposerCache"
import "./Composer.css"
import isMobile from "is-mobile"
import {TempoChangers} from "../SongUtils"
const NumOfColumnsPerCanvas = 35
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
            },
            timelineHeight: isMobile() ? 20 : 30
        }
        this.cache = new ComposerCache(this.state.column.width,height).cache
        this.stageSelected = false
        this.sliderSelected = false
        this.stagePreviousPositon = 0
        this.throttleStage = 0
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

    render() {
        let s = this.state
        let pixiOptions = {
            backgroundColor: 0x495466,
            antialias: true
        }
        const { data, functions } = this.props
        let sizes = this.state.column
        let xPos = (data.selected - NumOfColumnsPerCanvas / 2 + 1) * - sizes.width
        let timelineHeight = this.state.timelineHeight
        let counter = 0
        let switcher = false
        let cache = this.cache
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
                        let standardBg = cache.standard[Number(switcher)] // boolean is 1 or 0
                        let background = column.tempoChanger === 0 ? standardBg : cache.columns[column.tempoChanger]
                        background = data.selected === i ? cache.standard[2] : background
                        return <Column
                        cache={cache}
                        key={i}
                        data={column}
                        index={i}
                        sizes={sizes}
                        backgroundCache={background}
                        click={functions.selectColumn}
                        isSelected={i === data.selected}
                    />

                    })}
                </Container>
            </Stage>
            <Stage
                width={s.width}
                height={timelineHeight}
            >
                <Timeline
                    handleClick={this.handleClick}
                    handleSlide={this.handleSlide}
                    windowWidth={s.width}
                    xPos={xPos}
                    height={timelineHeight}
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
        height={height}
        interactive={true}
        pointertap={(e) => handleClick(e,"click")}
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
    let { data, index, sizes, click ,cache,backgroundCache } = props
    return <Container
        pointertap={() => click(index)}
        interactive={true}
        x={sizes.width * index}
        
    >
        <Sprite
            image={backgroundCache}
            interactiveChildren={false}
        >
        </Sprite>
        {data.notes.map((note) => {
            return <Sprite
            key={note.index}
            image={cache.notes[0]}
            x={noteMargin}
            y={positions[note.index] * sizes.height / 21}
            >

            </Sprite>
        })}
    </Container>
}

/*
        <Graphics draw={drawBg} />

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