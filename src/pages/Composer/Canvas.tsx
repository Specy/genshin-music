import { Component, createRef } from 'react'
import { Stage, Container, Graphics, Sprite } from '@inlet/react-pixi';
import { FaStepBackward, FaStepForward, FaPlusCircle, FaMinusCircle } from 'react-icons/fa';
import isMobile from "is-mobile"
import { ComposerCache } from "./TextureCache"
import { COMPOSER_NOTE_POSITIONS, NOTES_PER_COLUMN, APP_NAME } from "appConfig"
import Memoized from 'components/Memoized';
import { ThemeStore } from 'stores/ThemeStore';
import { observe } from 'mobx';
import { clamp, nearestEven } from 'lib/Utils/Tools';
import type{ Column, ColumnNote } from 'lib/Utils/SongClasses';
import type{ Texture } from 'pixi.js';
import type{ ComposerSettingsDataType } from 'lib/BaseSettings';

let NumOfColumnsPerCanvas = 35

type ClickEventType = 'up' | 'down' | 'downStage'
interface ComposerCanvasProps {
    data: {
        columns: Column[],
        selected: number,
        settings: ComposerSettingsDataType,
        breakpoints: number[],
        toolsColumns: number[]
    }
    functions: {
        selectColumn: (index: number, ignoreAudio?: boolean) => void,
        toggleBreakpoint: () => void
    }

}
interface ComposerCanvasState{
    width: number
    height: number
    column: {
        width: number
        height: number
    }
    timelineHeight: number
    currentBreakpoint: number
    theme: {
        timeline: {
            hex: string
            hexNumber: number
        }
    }
    cache: ComposerCache | null
}
export default class ComposerCanvas extends Component<ComposerCanvasProps,ComposerCanvasState> {
    state: ComposerCanvasState
    sizes: DOMRect
    notesStageRef: any
    breakpointsStageRef: any
    stageSelected: boolean
    sliderSelected: boolean
    hasSlided: boolean
    stagePreviousPositon: number
    sliderOffset: number
    throttleScroll: number
    onSlider: boolean
    dispose: () => void
    constructor(props: ComposerCanvasProps) {
        super(props)
        const sizes = document.body.getBoundingClientRect()
        this.sizes = sizes
        NumOfColumnsPerCanvas = Number(this.props.data.settings.columnsPerCanvas.value)
        let width = nearestEven(sizes.width * 0.84)
        let height = nearestEven(sizes.height * 0.45)

        if (window.screen.width < sizes.height) {
            width = nearestEven(sizes.height * 0.84)
            height = nearestEven(sizes.width * 0.45)
        }
        if (APP_NAME === "Sky") height = nearestEven(height * 0.95)
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
                timeline: {
                    hex: ThemeStore.layer('primary', 0.1).toString(),
                    hexNumber: ThemeStore.layer('primary', 0.1).rgbNumber()
                }
            },
            cache: null
        }
        this.notesStageRef = createRef()
        this.breakpointsStageRef = createRef()
        this.stageSelected = false
        this.sliderSelected = false
        this.hasSlided = false
        this.stagePreviousPositon = 0
        this.sliderOffset = 0
        this.throttleScroll = 0
        this.onSlider = false
        this.dispose = () => { }
    }
    resetPointerDown = () => {
        this.stageSelected = false
        this.sliderSelected = false
        this.stagePreviousPositon = 0
    }
    componentDidMount() {
        window.addEventListener("pointerup", this.resetPointerDown)
        window.addEventListener("keydown", this.handleKeyboard)
        this.notesStageRef?.current?._canvas?.addEventListener("wheel", this.handleWheel)
        this.setState({
            cache: this.getCache(
                this.state.column.width,
                this.state.height,
                isMobile() ? 2 : 4,
                this.state.timelineHeight
            )
        })
        this.dispose = observe(ThemeStore.state.data, () => {
            this.state?.cache?.destroy?.()
            this.setState({
                cache: this.getCache(
                    this.state.column.width,
                    this.state.height,
                    isMobile() ? 2 : 4,
                    this.state.timelineHeight
                ),
                theme: {
                    timeline: {
                        hex: ThemeStore.layer('primary', 0.1).toString(),
                        hexNumber: ThemeStore.layer('primary', 0.1).rgbNumber()
                    }
                }
            })
        })
    }
    componentWillUnmount() {
        window.removeEventListener("pointerup", this.resetPointerDown)
        window.removeEventListener("keydown", this.handleKeyboard)
        this.notesStageRef?.current?._canvas?.removeEventListener("wheel", this.handleWheel)
        this.dispose()
        this.state.cache?.destroy()
    }
    handleKeyboard = (event: KeyboardEvent) => {
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
    getCache(width: number, height: number, margin: number, timelineHeight: number) {
        const colors = {
            l: ThemeStore.get('primary'),
            d: ThemeStore.get('primary')
        }
        colors.l = colors.l.luminosity() < 0.05 ? colors.l.lighten(0.35) : colors.l.lighten(0.1)
        colors.d = colors.d.luminosity() < 0.05 ? colors.d.lighten(0.2) : colors.d.darken(0.03)
        if (!this.notesStageRef?.current && !this.breakpointsStageRef?.current) return null
        return new ComposerCache({
            width: width,
            height: height,
            margin: margin,
            timelineHeight: timelineHeight,
            app: this.notesStageRef.current.app,
            breakpointsApp: this.breakpointsStageRef.current.app,
            standardsColors: [
                {
                    color: colors.l.rgbNumber() //lighter
                }, {
                    color: colors.d.rgbNumber() //darker
                }, {
                    color: 0x1a968b //selected
                }, {
                    color: 0xd6722f
                }
            ]
        })

    }
    handleWheel = (e: WheelEvent) => {
        this.props.functions.selectColumn(this.props.data.selected + Math.sign(e.deltaY), true)
    }
    handleClick = (e: any, type: ClickEventType) => {
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
    handleStageSlide = (e: any) => {
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
    handleBreakpoints = (direction: 1 | -1) => {
        const { selected, columns, breakpoints } = this.props.data
        let breakpoint = direction === 1 //1 = right, -1 = left
            ? breakpoints.filter((v) => v > selected).sort((a, b) => a - b)
            : breakpoints.filter((v) => v < selected).sort((a, b) => b - a)
        if (breakpoint.length === 0) return
        if (columns.length >= breakpoint[0] && breakpoint[0] >= 0) {
            this.props.functions.selectColumn(breakpoint[0])
        }
    }
    handleSlide = (e: any) => {
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
        const cache = this.state.cache?.cache
        const sizes = this.state.column
        const xPos = (data.selected - NumOfColumnsPerCanvas / 2 + 1) * - sizes.width
        const beatMarks = Number(data.settings.beatMarks.value)
        const counterLimit = beatMarks === 0 ? 12 : 4 * beatMarks
        const relativeColumnWidth = width / data.columns.length
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
                    backgroundAlpha: 0,
                    antialias: true,
                    autoDensity: true,
                    resolution: window.devicePixelRatio || 1
                }}
                key={this.state.width}
                ref={this.notesStageRef}
            >
                {cache && <Container
                    anchor={[0.5, 0.5]}
                    x={xPos}
                    interactive={true}
                    pointerdown={(e) => this.handleClick(e, "downStage")}
                    pointermove={(e) => this.handleStageSlide(e)}
                >
                    {data.columns.map((column, i) => {
                        if (!isVisible(i, data.selected)) return null
                        const tempoChangersCache = (i + 1) % 4 === 0 ? cache.columnsLarger : cache.columns
                        const standardCache = (i + 1) % 4 === 0 ? cache.standardLarger : cache.standard
                        const background = column.tempoChanger === 0
                            ? standardCache[Number(i % (counterLimit * 2) >= counterLimit)]
                            : tempoChangersCache[column.tempoChanger]
                        return <RenderColumn
                            cache={cache}
                            key={i}
                            notes={column.notes}
                            index={i}
                            sizes={sizes}
                            backgroundCache={background}
                            isToolsSelected={data.toolsColumns.includes(i)}
                            onClick={functions.selectColumn}
                            isSelected={i === data.selected}
                            isBreakpoint={data.breakpoints.includes(i)}
                        />
                    })}
                </Container>
                }

            </Stage>
            <div className="timeline-wrapper" style={{ height: this.state.timelineHeight }}>
                <div
                    className="timeline-button"
                    onClick={() => this.handleBreakpoints(-1)}
                    style={{
                        backgroundColor: theme.timeline.hex
                    }}
                >
                    <Memoized>
                        <FaStepBackward />
                    </Memoized>
                </div>
                <div
                    className="timeline-button"
                    onClick={() => this.handleBreakpoints(1)}
                    style={{
                        marginLeft: 0,
                        backgroundColor: theme.timeline.hex
                    }}
                >
                    <Memoized>
                        <FaStepForward />
                    </Memoized>
                </div>
                <div className='timeline-scroll' style={{ backgroundColor: theme.timeline.hex }}>
                    <Stage
                        width={width}
                        height={timelineHeight}
                        options={{
                            backgroundAlpha: 0,
                            autoDensity: true,
                            resolution: window.devicePixelRatio || 1
                        }}
                        raf={false}
                        ref={this.breakpointsStageRef}
                        renderOnComponentChange={true}
                    >
                        {cache && <Container
                            width={width}
                            height={timelineHeight}
                            interactive={true}
                            pointerdown={(e) => this.handleClick(e, "down")}
                            pointerup={(e) => this.handleClick(e, "up")}
                            pointermove={this.handleSlide}
                        >
                            <Graphics
                                draw={(g) => {
                                    g.clear()
                                    g.beginFill(theme.timeline.hexNumber)
                                    g.drawRect(0, 0, width, timelineHeight)
                                }}
                            />
                            {data.breakpoints.map(breakpoint => {
                                return <Sprite
                                    texture={cache.breakpoints[0]}
                                    key={breakpoint}
                                    x={relativeColumnWidth * breakpoint}
                                >
                                </Sprite>
                            })}
                        </Container>
                        }
                        <Graphics
                            draw={(g) => {
                                g.clear()
                                g.lineStyle(3, 0x1a968b, 0.8)
                                g.drawRoundedRect(0, 0, stageSize - 2, timelineHeight - 4, 6)
                            }}
                            x={stagePosition}
                            y={2}
                        />
                    </Stage>
                </div>
                <div
                    className="timeline-button"
                    onClick={functions.toggleBreakpoint}
                    style={{
                        backgroundColor: theme.timeline.hex
                    }}
                >
                    <Memoized>
                        {data.breakpoints.includes(data.selected)
                            ? <FaMinusCircle key='minus' />
                            : <FaPlusCircle key='plus' />
                        }
                    </Memoized>
                </div>
            </div>
        </div>
    }
}

interface RenderColumnProps {
    notes: ColumnNote[]
    index: number
    sizes: {
        width: number
        height: number
    }
    cache: any
    backgroundCache: Texture
    isBreakpoint: boolean
    isSelected: boolean
    isToolsSelected: boolean
    onClick: (index: number) => void
}

function RenderColumn({ notes, index, sizes, onClick, cache, backgroundCache, isBreakpoint, isSelected, isToolsSelected }: RenderColumnProps) {
    return <Container
        pointertap={() => onClick(index)}
        interactive={true}
        x={sizes.width * index}
    >
        <Sprite
            texture={backgroundCache}
            interactiveChildren={false}
        >
            {(isSelected || isToolsSelected) &&
                <Sprite
                    texture={isToolsSelected && !isSelected ? cache.standard[3] : cache.standard[2]}
                    alpha={isToolsSelected ? 0.4 : 0.6}
                    zIndex={1}
                />
            }
            {isBreakpoint &&
                <Sprite
                    texture={cache.breakpoints[1]}
                />
            }
        </Sprite>

        {notes.map((note: any) => {
            return <Sprite
                key={note.index}
                texture={cache.notes[note.layer]}
                y={COMPOSER_NOTE_POSITIONS[note.index] * sizes.height / NOTES_PER_COLUMN}
            >
            </Sprite>
        })}

    </Container>
}

function calcMinColumnWidth(parentWidth: number) {
    return nearestEven(parentWidth / NumOfColumnsPerCanvas)
}


function isVisible(pos: number, currentPos: number) {
    const threshold = NumOfColumnsPerCanvas / 2 + 2
    return (currentPos - threshold) < pos && pos < (currentPos + threshold)
}