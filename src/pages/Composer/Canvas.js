import React, { Component } from 'react'
import { Stage, Container, Graphics, Sprite } from '@inlet/react-pixi';
import { FaStepBackward, FaStepForward, FaPlusCircle, FaMinusCircle } from 'react-icons/fa';
import isMobile from "is-mobile"
import "./Composer.css"
import { ComposerCache } from "./Cache"

import { composerNotePositions, NOTES_PER_COLUMN, appName } from "appConfig"
import Memoized from 'components/Memoized';
import { ThemeStore } from 'stores/ThemeStore';
import { observe } from 'mobx';
let NumOfColumnsPerCanvas = 35

export default class ComposerCanvas extends Component {
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
        if (appName === "Sky") height = nearestEven(height * 0.95)
        this.state = {
            width: Math.floor(width),
            height: Math.floor(height),
            column: {
                width: calcMinColumnWidth(nearestEven(width)),
                height: height
            },
            timelineHeight: isMobile() ? 25 : 30,
            currentBreakpoint: -1,
            theme: {
                background: ThemeStore.get('primary').darken(0.1).rgbNumber(),
                timeline: ThemeStore.get('primary').lighten(0.1).rgbNumber()
            }
        }
        this.canvasRef = React.createRef()
        let margin = isMobile() ? 1 : 4
        this.cache = new ComposerCache({
            width: this.state.column.width, 
            height: height, 
            margin: margin, 
            timelineHeight: this.state.timelineHeight,
            standardsColors:  [
                    {
                        color: ThemeStore.get('primary').lighten(0.1).rgbNumber() //lighter
                    },{
                        color: ThemeStore.get('primary').darken(0.03).rgbNumber() //darker
                    },{
                        color: 0x1a968b //selected
                    },{
                        color: 0xd6722f
                    }
                ]
            })
        this.stageSelected = false
        this.sliderSelected = false
        this.hasSlided = false
        this.stagePreviousPositon = 0
        this.sliderOffset = 0
        this.throttleScroll = 0
        this.onSlider = false
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
            default:
                break;
        }
    }
    handleWheel = (e) => {
        this.props.functions.selectColumn(this.props.data.selected + Math.sign(e.deltaY), true)
    }
    handleClick = (e, type) => {
        const x = e.data.global.x
        const { width } = this.state
        const { data } = this.props
        if (type === "up") {
            this.sliderSelected = false
        }
        if (type === "down") {
            this.sliderSelected = true
            const relativeColumnWidth = width / data.columns.length
            const stageSize = relativeColumnWidth * (NumOfColumnsPerCanvas + 1)
            const stagePosition = relativeColumnWidth * data.selected - (NumOfColumnsPerCanvas / 2) * relativeColumnWidth
            this.onSlider = x > stagePosition && x < stagePosition + stageSize
            this.sliderOffset = stagePosition + stageSize / 2 - x
            this.throttleScroll = Number.MAX_SAFE_INTEGER
            this.handleSlide(e)
        }
        if (type === "downStage") {
            this.stagePreviousPositon = x
            this.stageSelected = true
        }
    }
    handleStageSlide = (e) => {
        let x = e.data.global.x
        if (this.stageSelected === true) {
            if (this.throttleScroll++ < 5) return
            this.throttleScroll = 0
            const { data, functions } = this.props
            const amount = clamp(Math.ceil(Math.abs(this.stagePreviousPositon - x) / 8), 0, 4)
            const sign = this.stagePreviousPositon < x ? -1 : 1
            this.stagePreviousPositon = x
            const newPosition = data.selected + sign * amount
            if (data.selected === newPosition) return
            functions.selectColumn(clamp(newPosition, 0, data.columns.length - 1), true)
        }
    }
    handleBreakpoints = (direction) => {
        const { selected, columns, breakpoints } = this.props.data
        let breakpoint = direction === 1 //1 = right, -1 = left
            ? breakpoints.filter((v) => v > selected).sort((a, b) => a - b)
            : breakpoints.filter((v) => v < selected).sort((a, b) => b - a)
        if (breakpoint.length === 0) return
        if (columns.length >= breakpoint[0] && breakpoint[0] >= 0) {
            this.props.functions.selectColumn(breakpoint[0])
        }
    }
    handleSlide = (e) => {
        const globalX = e.data.global.x
        if (this.sliderSelected) {
            if (this.throttleScroll++ < 4) return
            const { width, column } = this.state
            const { data } = this.props
            this.hasSlided = true
            this.throttleScroll = 0
            const totalWidth = column.width * data.columns.length
            const x = this.onSlider ? (globalX + this.sliderOffset) : globalX
            let relativePos = Math.floor(x / width * totalWidth / column.width)
            this.props.functions.selectColumn(relativePos, true)
        }
    }

    render() {
        const { width, timelineHeight, height, theme } = this.state
        const { data, functions } = this.props
        const cache = this.cache.cache
        const sizes = this.state.column
        const xPos = (data.selected - NumOfColumnsPerCanvas / 2 + 1) * - sizes.width
        const beatMarks = Number(data.settings.beatMarks.value)
        const counterLimit = beatMarks === 0 ? 11 : 4 * beatMarks - 1
        const relativeColumnWidth = width / data.columns.length
        let switcher = false
        let counter = 0
        let stageSize = Math.floor(relativeColumnWidth * (NumOfColumnsPerCanvas + 1))
        if (stageSize > width) stageSize = width
        const stagePosition = relativeColumnWidth * data.selected - (NumOfColumnsPerCanvas / 2 - 1) * relativeColumnWidth
        return <div className="canvas-wrapper" style={{ width: width + 2 }}>
            <Stage
                width={width}
                height={height}
                raf={false}
                renderOnComponentChange={true}
                options={{
                    backgroundAlpha: 0
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
                        const tempoChangersCache = (i + 1) % 4 === 0 ? cache.columnsLarger : cache.columns
                        const standardCache = (i + 1) % 4 === 0 ? cache.standardLarger : cache.standard
                        const background = column.tempoChanger === 0 ? standardCache[Number(switcher)] : tempoChangersCache[column.tempoChanger]
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
                    <Memoized>
                        <FaStepBackward />
                    </Memoized>
                </div>
                <div className="timeline-button" onClick={() => this.handleBreakpoints(1)} style={{ marginLeft: 0 }}>
                    <Memoized>
                        <FaStepForward />  
                    </Memoized>
                </div>
                <div className='timeline-scroll'>
                    <Stage
                        width={width}
                        height={timelineHeight}
                        options={{ antialias: true, autoDensity: true, backgroundColor: theme.timeline }}
                        raf={false}
                        renderOnComponentChange={true}
                    >
                        <Container
                            width={width}
                            height={timelineHeight}
                            interactive={true}
                            pointerdown={(e) => this.handleClick(e, "down")}
                            pointerup={(e) => this.handleClick(e, "up")}
                            pointermove={this.handleSlide}
                        >
                            <Graphics draw={(e) => { fillX(e, width, timelineHeight) }} />
                            {data.breakpoints.map(breakpoint => {
                                return <Sprite
                                    image={cache.breakpoints[0]}
                                    key={breakpoint}
                                    x={relativeColumnWidth * breakpoint}
                                >
                                </Sprite>
                            })}
                        </Container>
                        <Graphics draw={(e) => drawStage(e, stageSize, timelineHeight)} x={stagePosition} y={2} />
                    </Stage>
                </div>
                <div className="timeline-button" onClick={functions.toggleBreakpoint}>
                    <Memoized>
                        {data.breakpoints.includes(data.selected) 
                            ? <FaMinusCircle key='minus'/>
                            : <FaPlusCircle key='plus'/>
                        }   
                    </Memoized>
                </div>
            </div>
        </div>
    }
}

function fillX(g, width, height) {
    g.clear()
    g.drawRect(0, 0, width, height)
}

function drawStage(g, width, height) {
    g.clear()
    g.lineStyle(3, 0x1a968b, 0.8)
    g.drawRoundedRect(0, 0, width - 2, height - 4, 6)
}

function Column({ data, index, sizes, click, cache, backgroundCache, isBreakpoint, isSelected, isToolsSelected }) {
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
                image={isToolsSelected && !isSelected ? cache.standard[3] : cache.standard[2]}
                alpha={isToolsSelected ? 0.4 : 0.6}
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
                y={composerNotePositions[note.index] * sizes.height / NOTES_PER_COLUMN}
            >
            </Sprite>
        })}

    </Container>
}
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

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