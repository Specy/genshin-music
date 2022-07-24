import { Stage } from "@inlet/react-pixi"
import { subscribeTheme } from "lib/Hooks/useTheme"
import { VsrgHitObject, VsrgSong } from "lib/Songs/VsrgSong"
import { ThrottledEventLoop } from "lib/ThrottledEventLoop"
import { Application } from "pixi.js"
import React, { Component, createRef } from "react"
import { ThemeProvider, ThemeStoreClass } from "stores/ThemeStore"
import { VsrgComposerEvents, vsrgComposerStore } from "stores/VsrgComposerStore"
import { VsrgCanvasCache } from "./VsrgComposerCache"
import { VsrgKeysRenderer } from "./VsrgKeysRenderer"
import { VsrgScrollableTrackRenderer } from "./VsrgScrollableTrackRenderer"


export type VsrgCanvasSizes = {
    el: DOMRect
    width: number
    height: number
    snapPointWidth: number
    keyHeight: number
    keyWidth: number
}
export type VsrgCanvasColors = {
    background_plain: [string, number]
    background: [string, number]
    background_10: [string, number]
    secondary: [string, number]
    lineColor: [string, number]
    lineColor_10: [string, number]
    accent: [string, number]
}
interface VsrgCanvasProps {
    isHorizontal: boolean
    vsrg: VsrgSong
    isPlaying: boolean
    snapPoint: number
    snapPoints: number[]
    selectedHitObject: VsrgHitObject | null
    onTimestampChange: (timestamp: number) => void
    onSnapPointSelect: (timestamp: number,key: number, type?: 0 | 2) => void
    dragHitObject: (timestamp: number, key?: number) => void
    releaseHitObject: () => void
    selectHitObject: (hitObject: VsrgHitObject, trackIndex:number, clickType: number) => void
}
interface VsrgCanvasState {
    canvasColors: VsrgCanvasColors
    sizes: VsrgCanvasSizes
    timestamp: number
    cache: VsrgCanvasCache | null
    isPressing: boolean
    previousPosition: number
    preventClick: boolean
    totalMovement: number
    draggedHitObject: VsrgHitObject | null
}

const VsrgKeysMap = {
    4: ["A", "S", "G", "H"],
    6: ["A", "S", "D", "G", "H", "J"],
    8: ["A", "S", "D", "F", "G", "H", "J", "K"],
}



export class VsrgCanvas extends Component<VsrgCanvasProps, VsrgCanvasState>{
    wrapperRef = createRef<HTMLDivElement>()
    stageRef = createRef<any>()
    toDispose: (() => void)[] = []
    throttledEventLoop: ThrottledEventLoop = new ThrottledEventLoop(() => {}, 144)
    constructor(props: VsrgCanvasProps) {
        super(props)
        this.state = {
            canvasColors: {
                background_plain: ["#000000", 0],
                background: ['#000000', 0],
                background_10: ['#000000', 0],
                secondary: ['#ffffff', 0xffffff],
                lineColor: ['#ffffff', 0xffffff],
                lineColor_10: ['#ffffff', 0xffffff],
                accent: ['#ffffff', 0xffffff],
            },
            timestamp: 0,
            sizes: {
                el: new DOMRect(),
                width: 0,
                height: 0,
                snapPointWidth: 0,
                keyHeight: 0,
                keyWidth: 0,
            },
            draggedHitObject: null,
            isPressing: false,
            totalMovement: 0,
            previousPosition: 0,
            preventClick: false,
            cache: null
        }
        this.wrapperRef = createRef()
        this.stageRef = createRef()
    }
    componentDidMount() {
        this.toDispose.push(subscribeTheme(this.handleThemeChange))
        window.addEventListener("resize", this.calculateSizes)
        this.toDispose.push(() => window.removeEventListener("resize", this.calculateSizes))
        vsrgComposerStore.addEventListener("ALL", {
            callback: this.handleEvent,
            id: "vsrg-canvas-color-change"
        })
        this.toDispose.push(() => vsrgComposerStore.removeEventListener("ALL",{id: "vsrg-canvas-color-change"}))
        this.calculateSizes()
        this.throttledEventLoop.setCallback(this.handleTick)
        this.throttledEventLoop.start()
        this.handleThemeChange(ThemeProvider)
    }
    componentWillUnmount() {
        this.toDispose.forEach(d => d())
        this.state.cache?.destroy()
        this.throttledEventLoop.stop()
    }
    handleEvent = (event: VsrgComposerEvents) => {
        if(event === 'colorChange') this.generateCache()
        if(event === 'updateKeys') this.calculateSizes()
        if(event === 'updateOrientation') this.calculateSizes()
        if(event === 'snapPointChange') this.calculateSizes()
        if(event === 'tracksChange') this.generateCache()
        if(event === 'songLoad') this.calculateSizes()
    }
    handleTick = (elapsed: number, sinceLast: number) => {
        if(this.props.isPlaying){
            const timestamp = this.state.timestamp + sinceLast
            this.props.onTimestampChange(timestamp)
            this.setState({ timestamp })
        }
    }
    calculateSizes = () => {
        const { wrapperRef } = this
        if (!wrapperRef.current) return console.log("no wrapper")
        const wrapperSizes = wrapperRef.current.getBoundingClientRect()

        const sizes = {
            el: wrapperSizes,
            width: wrapperSizes.width,
            height: wrapperSizes.height,
            keyHeight: wrapperSizes.height / VsrgKeysMap[this.props.vsrg.keys].length,
            keyWidth: wrapperSizes.width / VsrgKeysMap[this.props.vsrg.keys].length,
            snapPointWidth: (60000 / this.props.vsrg.bpm) / this.props.snapPoint,
        }
        const canvas = wrapperRef.current.querySelector('canvas')
        if(canvas){
            canvas.style.width = `${sizes.width}px`
            canvas.style.height = `${sizes.height}px`
        }
        this.setState({ sizes }, this.generateCache)
    }
    handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        this.setState({
            timestamp: Math.max(0, this.state.timestamp + e.deltaY / 1.2 )
        }, () => {
            const { draggedHitObject, timestamp} = this.state
            this.props.onTimestampChange(this.state.timestamp)
            if(!draggedHitObject || timestamp <= 0) return 
            this.props.dragHitObject(draggedHitObject.timestamp + e.deltaY / 1.2)
        })
    }
    setIsDragging = (e: React.PointerEvent<HTMLCanvasElement>) => {
        this.setState({ 
            isPressing: true,
            previousPosition: this.props.isHorizontal ? e.clientX : -e.clientY
        })
    }
    setIsNotDragging = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if(!this.state.isPressing) return
        const draggedHitObject = this.state.draggedHitObject
        this.setState({ isPressing: false,  totalMovement: 0, draggedHitObject: null}, () => {
            //dumbass idk how to make otherwise
            if(draggedHitObject) this.props.releaseHitObject()
            setTimeout(() => this.setState({ preventClick: false }), 200)
        })
    }
    handleDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if(!this.state.isPressing) return
        const { previousPosition, draggedHitObject, sizes } = this.state
        const { isHorizontal } = this.props
        const deltaOrientation = isHorizontal ? e.clientX : -e.clientY
        const keyPosition = isHorizontal ? e.clientY - sizes.el.top : e.clientX - sizes.el.left
        const hoveredPosition = Math.floor(keyPosition / (isHorizontal ? sizes.keyHeight : sizes.keyWidth))
        const delta = previousPosition - deltaOrientation
        const newTotalMovement = this.state.totalMovement + Math.abs(delta)
        if(draggedHitObject !== null){
            const position = draggedHitObject.timestamp - delta
            return this.setState({ previousPosition: deltaOrientation }, 
                () => this.props.dragHitObject(Math.max(0, position), hoveredPosition)
            )
        }
        this.setState({ 
            previousPosition: deltaOrientation,
            preventClick: newTotalMovement > 50,
            totalMovement: newTotalMovement,
            timestamp: Math.max(0, this.state.timestamp + delta)
        }, () => this.props.onTimestampChange(this.state.timestamp))
    }
    generateCache = () => {
        const { sizes, canvasColors, cache } = this.state
        const trackColors = this.props.vsrg.tracks.map(t => t.color)
        if (!this.stageRef.current) return
        const newCache = new VsrgCanvasCache({
            app: this.stageRef.current.app as Application,
            sizes,
            colors: canvasColors,
            trackColors,
            isHorizontal: this.props.isHorizontal
        })
        this.setState({ cache: newCache }, () => {
            cache?.destroy()  
        })
    }
    selectHitObject = (hitObject: VsrgHitObject, trackIndex: number, clickType: number) => {
        if(clickType !== 2) this.setState({ draggedHitObject: hitObject })
        this.props.selectHitObject(hitObject, trackIndex, clickType)
    }
    handleThemeChange = (theme: ThemeStoreClass) => {
        const bg_plain = theme.get('primary')
        const bg_line = theme.getText('primary')
        const bg_line_10 = bg_line.darken(0.5).desaturate(1)
        const bg = bg_plain.darken(0.15)
        const bg_10 = bg.darken(0.1)
        const secondary = theme.get('secondary')
        const accent = theme.get('accent')
        this.setState({
            canvasColors: {
                background_plain: [bg_plain.hex(), bg_plain.rgbNumber()],
                background: [bg.hex(), bg.rgbNumber()],
                background_10: [bg_10.hex(), bg_10.rgbNumber()],
                secondary: [secondary.hex(), secondary.rgbNumber()],
                lineColor: [bg_line.hex(), bg_line.rgbNumber()],
                lineColor_10: [bg_line_10.hex(), bg_line_10.rgbNumber()],
                accent: [accent.hex(), accent.rgbNumber()],
            }
        }, this.generateCache)
    }

    render() {
        const { canvasColors, sizes, cache } = this.state
        const { vsrg, isHorizontal } = this.props
        return <div
            className="vsrg-top-canvas-wrapper"
            ref={this.wrapperRef}
        >
            {this.wrapperRef.current &&
                <Stage
                    onMount={this.calculateSizes}
                    ref={this.stageRef}
                    raf={false}
                    width={sizes.width}
                    height={sizes.height}
                    onWheel={this.handleWheel}
                    onPointerDown={this.setIsDragging}
                    onPointerUp={this.setIsNotDragging}
                    onPointerLeave={this.setIsNotDragging}
                    onPointerMoveCapture={this.handleDrag}
                    onContextMenu={(e) => e.preventDefault()}
                    options={{
                        backgroundColor: canvasColors.background[1],
                        autoDensity: false,
                        resolution: window.devicePixelRatio || 1,
                    }}
                >
                    {cache &&
                        <VsrgScrollableTrackRenderer
                            tracks={vsrg.tracks}
                            cache={cache}
                            selectedHitObject={this.props.selectedHitObject}
                            snapPoint={this.props.snapPoint}
                            snapPoints={this.props.snapPoints}
                            timestamp={this.state.timestamp}
                            preventClick={this.state.preventClick}
                            sizes={sizes}
                            colors={canvasColors}
                            keys={vsrg.keys}
                            isHorizontal={isHorizontal}
                            selectHitObject={this.selectHitObject}
                            onSnapPointSelect={this.props.onSnapPointSelect}
                        />
                    }

                    <VsrgKeysRenderer
                        isHorizontal={isHorizontal}
                        keys={VsrgKeysMap[vsrg.keys]}
                        sizes={sizes}
                        colors={canvasColors}
                    />
                </Stage>
            }
        </div>
    }
}