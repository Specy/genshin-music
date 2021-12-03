import React, { Component } from 'react'
import { Stage, Container, Graphics, Sprite } from '@inlet/react-pixi';
import { FaStepBackward, FaStepForward, FaPlusCircle, FaMinusCircle } from 'react-icons/fa';
import isMobile from "is-mobile"
import "./Composer.css"
import { ComposerCache } from "./ComposerCache"

import { composerNotePositions, notesPerColumn, appName } from "../../appConfig"
let NumOfColumnsPerCanvas = 35

class ComposerCanvas extends Component {
    constructor(props) {
        super(props)
        let sizes = document.body.getBoundingClientRect()
        this.sizes = sizes
        NumOfColumnsPerCanvas = Number(this.props.data.settings.columnsPerCanvas.value)
        let width = nearestEven(sizes.width * 0.84)
        let height = nearestEven(sizes.height * 0.45)

        if (window.screen.width < sizes.height) {
            width = nearestEven(sizes.height * 0.84)
            height = nearestEven(sizes.width * 0.45)
        }
        if(appName === "Sky") height = nearestEven(height * 0.95)
        this.state = {
            width: Math.floor(width),
            height: Math.floor(height),
            column: {
                width: calcMinColumnWidth(nearestEven(width)),
                height: height
            },
            timelineHeight: isMobile() ? 25 : 30,
            currentBreakpoint: -1
        }
        this.canvasRef = React.createRef()
        let margin = isMobile() ? 1 : 4
        this.cache = new ComposerCache(this.state.column.width, height, margin, this.state.timelineHeight)
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
    componentDidMount() {
        window.addEventListener("pointerup", this.resetPointerDown)
        window.addEventListener("keydown", this.handleKeyboard)
        this.canvasRef.current._canvas.addEventListener("wheel", this.handleWheel)
    }
    componentWillUnmount() {
        window.removeEventListener("pointerup", this.resetPointerDown)
        window.removeEventListener("keydown", this.handleKeyboard)
        this.canvasRef.current._canvas.removeEventListener("wheel", this.handleWheel)
        this.cache.destroy()
    }
    handleKeyboard = (event) => {
        let key = event.code
        switch (key) {
            case "ArrowRight": this.handleBreakpoints(1)
                break;
            case "ArrowLeft": this.handleBreakpoints(-1)
                break;
            default : 
                break;
        }
    }
    handleWheel = (e) => {
        if (e.deltaY < 0) {
            this.props.functions.selectColumn(this.props.data.selected - 1, true)
        } else {
            this.props.functions.selectColumn(this.props.data.selected + 1, true)
        }
    }
    handleClick = (e, type) => {
        let x = e.data.global.x
        if (type === "click") {
            let totalWidth = this.state.column.width * this.props.data.columns.length

            let relativePos = Math.floor(x / this.state.width * totalWidth / this.state.column.width)
            this.props.functions.selectColumn(relativePos)
        }
        if (type === "up") {
            this.sliderSelected = false
        }
        if (type === "down") {
            this.sliderSelected = true
        }
        if (type === "downStage") {
            this.stagePreviousPositon = x
            this.stageSelected = true
        }
    }
    handleStageSlide = (e) => {
        let x = e.data.global.x
        if (this.stageSelected === true) {
            this.throttleStage++
            if (this.throttleStage < 5) return
            this.throttleStage = 0
            let isMovingLeft = this.stagePreviousPositon < x
            let amount = Math.ceil(Math.abs(this.stagePreviousPositon - x) / 8)
            if (amount > 4) amount = 4
            let toAdd = isMovingLeft ? -1 : 1
            this.stagePreviousPositon = x
            let finalPos = this.props.data.selected + toAdd * amount
            if (this.props.data.selected === finalPos) return
            if (finalPos < 0) finalPos = 0
            if (finalPos > this.props.data.columns.length) finalPos = this.props.data.columns.length - 1
            this.props.functions.selectColumn(finalPos, true)
        }
    }
    handleBreakpoints = (direction) => {
        let selectedColumn = this.props.data.selected
        let columns = this.props.data.columns
        let breakpoint
        let breakpoints = this.props.data.breakpoints
        if (direction === 1) {//right
            breakpoint = breakpoints.filter((v) => v > selectedColumn).sort((a, b) => a - b)
        } else {
            breakpoint = breakpoints.filter((v) => v < selectedColumn).sort((a, b) => b - a)
        }
        if (breakpoint.length >= 0) {
            if (columns.length >= breakpoint[0] && breakpoint[0] >= 0) {
                this.props.functions.selectColumn(breakpoint[0])
            }
        }

    }
    handleSlide = (e) => {
        if (this.sliderSelected) {
            this.throttleStage++
            if (this.throttleStage < 4) return
            this.throttleStage = 0
            let totalWidth = this.state.column.width * this.props.data.columns.length
            let x = e.data.global.x
            let relativePos = Math.floor(x / this.state.width * totalWidth / this.state.column.width)
            this.props.functions.selectColumn(relativePos, true)
        }
    }

    render() {
        let s = this.state
        const { width, timelineHeight, height} = this.state
        const cache = this.cache.cache
        const { data, functions } = this.props
        let sizes = this.state.column
        let xPos = (data.selected - NumOfColumnsPerCanvas / 2 + 1) * - sizes.width
        let switcher = false
        let counter = 0
        const beatMarks = Number(data.settings.beatMarks.value)
        const counterLimit = beatMarks === 0 ? 11 : 4 * beatMarks - 1
        let relativeColumnWidth = width / data.columns.length
        let stageSize = Math.floor(relativeColumnWidth * (NumOfColumnsPerCanvas + 1))
        if (stageSize > width) stageSize = width
        let stagePos = relativeColumnWidth * data.selected - (NumOfColumnsPerCanvas / 2 - 1) * relativeColumnWidth
        return <div className="canvas-wrapper" style={{ width: width + 2 }}>
            <Stage
                width={width}
                height={height}
                raf={false}
                renderOnComponentChange={true}
                options={{
                    backgroundColor: 0x495466,
                }}
                key={this.state.width}
                ref={this.canvasRef}
            >
                <Container
                    anchor={[0.5, 0.5]}
                    x={xPos}
                    interactive={true}
                    pointerdown={(e) => this.handleClick(e, "downStage")}
                    pointermove={(e) => this.handleStageSlide(e)}
                >
                    {data.columns.map((column, i) => {
                        if (counter > counterLimit) {
                            switcher = !switcher
                            counter = 0
                        }
                        counter++
                        if (!isVisible(i, data.selected)) return null
                        let tempoChangersCache = (i + 1) % 4 === 0 ? cache.columnsLarger : cache.columns
                        let standardCache = (i + 1) % 4 === 0 ? cache.standardLarger : cache.standard
                        let standardBg = standardCache[Number(switcher)] // boolean is 1 or 0
                        let background = column.tempoChanger === 0 ? standardBg : tempoChangersCache[column.tempoChanger]
                        return <Column
                            cache={cache}
                            key={i}
                            data={column}
                            index={i}
                            sizes={sizes}
                            backgroundCache={background}
                            isToolsSelected={data.toolsColumns.includes(i)}
                            click={functions.selectColumn}
                            isSelected={i === data.selected}
                            isBreakpoint={data.breakpoints.includes(i)}
                        />

                    })}

                </Container>
            </Stage>
            <div className="timeline-wrapper" style={{ height: this.state.timelineHeight }}>
                <div className="timeline-button" onClick={() => this.handleBreakpoints(-1)}>
                    <FaStepBackward />
                </div>
                <div className="timeline-button" onClick={() => this.handleBreakpoints(1)}>
                    <FaStepForward />
                </div>
                <Stage
                    width={s.width}
                    height={timelineHeight}
                    options={{ antialias: true, autoDensity: true,backgroundColor: 0x515c6f }}
                    raf={false}
                    renderOnComponentChange={true}
                >   
                    <Container
                        width={this.state.width}
                        height={this.state.timelineHeight}
                        interactive={true}
                        pointertap={(e) => this.handleClick(e, "click")}
                        pointerdown={(e) => this.handleClick(e, "down")}
                        pointerup={(e) => this.handleClick(e, "up")}
                        pointermove={this.handleSlide}
                    >
                        <Graphics draw={(e) => { fillX(e, this.state.width, this.state.timelineHeight) }}/>
                        {data.breakpoints.map(breakpoint => {
                            return <Sprite
                                image={cache.breakpoints[0]}
                                key={breakpoint}
                                x={relativeColumnWidth * breakpoint}
                            >
                            </Sprite>
                        })}
                    </Container>

                    <Graphics draw={(e) => drawStage(e, stageSize, this.state.timelineHeight)} x={stagePos} y={2} />


                </Stage>
                <div className="timeline-button" onClick={functions.toggleBreakpoint}>
                    {data.breakpoints.includes(data.selected) ? <FaMinusCircle/> : <FaPlusCircle />}
                </div>
            </div>
        </div>
    }
}

function fillX(g, width, height) {
    g.clear()
    g.beginFill(0x515c6f, 1)
    g.drawRect(0, 0, width, height)
}
function drawStage(g, width, height) {
    g.clear()
    g.lineStyle(3, 0x1a968b, 0.8)
    g.drawRoundedRect(0, 0, width - 2, height - 4, 6)
}

function Column(props) {
    let { data, index, sizes, click, cache, backgroundCache, isBreakpoint, isSelected, isToolsSelected } = props
    return <Container
        pointertap={() => click(index)}
        interactive={true}
        x={sizes.width * index}
    >
        <Sprite
            image={backgroundCache}
            interactiveChildren={false}
        >
            {isSelected || isToolsSelected ? <Sprite
                image={isToolsSelected && !isSelected? cache.standard[3] : cache.standard[2]}
                alpha={isToolsSelected ?0.4 : 0.6}
                zIndex={1}
            >
            </Sprite> : null}
            {isBreakpoint ? <Sprite
                image={cache.breakpoints[1]}
            >
            </Sprite> : null}
        </Sprite>
        {data.notes.map((note) => {
            return <Sprite
                key={note.index}
                image={cache.notes[note.layer]}
                y={composerNotePositions[note.index] * sizes.height / notesPerColumn}
            >
            </Sprite>
        })}

    </Container>
}
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
export default ComposerCanvas